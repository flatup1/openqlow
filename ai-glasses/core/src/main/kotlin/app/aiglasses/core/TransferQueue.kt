package app.aiglasses.core

/** 1つのファイルが今どの段階にいるか。 */
enum class TransferState {
    /** 待機中。これから取り込む。 */
    PENDING,

    /** 転送中。 */
    IN_PROGRESS,

    /** 完了。**この状態のものは何があっても消さない。** */
    DONE,

    /** 保留。あとで自動的にやり直す。途中まで受け取った分は保持している。 */
    HELD,

    /** 失敗。ユーザーが何かしない限り、やり直しても同じ結果になる。 */
    FAILED,
}

/** グラスが「途中から再開」に対応しているか。実機で確認するまでは UNKNOWN。 */
enum class ResumePolicy {
    /** HTTP Range に対応。途中から続きを取れる。 */
    SUPPORTED,

    /** 非対応。やり直すときは、そのファイルだけ最初から取り直す。 */
    NOT_SUPPORTED,

    /** 未確認。安全側に倒して NOT_SUPPORTED と同じ扱いにする。 */
    UNKNOWN,
}

data class TransferJob(
    val item: MediaItem,
    val state: TransferState,
    /** 途中まで受け取ったバイト数。 */
    val bytesReceived: Long = 0L,
    /** 何回やり直したか。 */
    val attempts: Int = 0,
    val lastError: TransferError? = null,
)

/**
 * 取り込みの待ち行列。**このモジュールの心臓部**です。
 *
 * 要件のうち、次のものをここで守ります。
 * - 接続が切れても、すでに転送済みのデータを消さない
 * - 未完了のファイルをキューとして保存する
 * - 再接続時に自動で再試行する
 * - 完了、失敗、保留の件数を区別する
 * - 一時ファイルへ保存し、完全に受信できた後で正式ファイルへ切り替える（[PartFile] と合わせて使う）
 *
 * このクラスは通信をしません。「今どうなっているか」を正しく覚えておくだけの係です。
 * 実際のダウンロードはAndroid側/iOS側が行い、結果をこのクラスに報告します。
 */
class TransferQueue(
    private val resumePolicy: ResumePolicy = ResumePolicy.UNKNOWN,
    /** 自動でやり直す上限。これを超えたら FAILED にして、ユーザーに判断を返す。 */
    private val maxAttempts: Int = 3,
) {
    private val jobs = LinkedHashMap<String, TransferJob>()

    /** 途中から再開してよいか。未確認のときは安全側（最初から取り直す）。 */
    private val canResume: Boolean get() = resumePolicy == ResumePolicy.SUPPORTED

    /**
     * 取り込む候補を待ち行列に入れる。
     * すでに行列にあるものは無視する（同じものを二重に並べない）。
     * @return 新しく追加した件数
     */
    fun enqueue(items: List<MediaItem>): Int {
        var added = 0
        for (item in items) {
            if (jobs.containsKey(item.id)) continue
            jobs[item.id] = TransferJob(item = item, state = TransferState.PENDING)
            added++
        }
        return added
    }

    /**
     * 次に取り込むものを1つ取り出し、転送中にする。
     * @return 取り出した仕事。もう無ければ null。
     */
    fun nextPending(): TransferJob? {
        val job = jobs.values.firstOrNull { it.state == TransferState.PENDING } ?: return null
        val started = job.copy(state = TransferState.IN_PROGRESS, attempts = job.attempts + 1)
        jobs[job.item.id] = started
        return started
    }

    /** どこまで受け取ったかを記録する。進み具合の表示に使う。 */
    fun recordBytes(id: String, bytesReceived: Long) {
        val job = jobs[id] ?: return
        if (job.state != TransferState.IN_PROGRESS) return
        jobs[id] = job.copy(bytesReceived = bytesReceived.coerceAtLeast(0L))
    }

    /**
     * 受け取り終わったことを報告する。
     *
     * ここで大きさを検査します。一覧に書かれていた大きさと違えば、
     * **正式なファイルにはせず**、やり直しの対象にします。壊れた写真を残さないためです。
     *
     * @return 問題なければ null。大きさが違えば [TransferError.SizeMismatch]。
     */
    fun complete(id: String, actualBytes: Long): TransferError? {
        val job = jobs[id] ?: return null
        val expected = job.item.sizeBytes

        // グラスが大きさを教えてくれない機種（0）のときは検査を飛ばす。
        if (expected > 0L && actualBytes != expected) {
            val error = TransferError.SizeMismatch(expectedBytes = expected, actualBytes = actualBytes)
            fail(id, error)
            return error
        }

        jobs[id] = job.copy(
            state = TransferState.DONE,
            bytesReceived = actualBytes,
            lastError = null,
        )
        return null
    }

    /**
     * 失敗を報告する。
     *
     * - やり直す価値があり、回数の上限内 → HELD（あとで自動的にやり直す）
     * - それ以外 → FAILED（ユーザーに次の操作を見せる）
     *
     * **すでに DONE のものは何もしません。** 取り込み済みのデータを失わないためです。
     */
    fun fail(id: String, error: TransferError) {
        val job = jobs[id] ?: return
        if (job.state == TransferState.DONE) return

        val shouldRetry = error.retryable && job.attempts < maxAttempts
        val nextState = if (shouldRetry) TransferState.HELD else TransferState.FAILED

        // 途中から再開できない機種では、受け取りかけの分は捨てて最初からやり直す。
        val keptBytes = if (shouldRetry && canResume) job.bytesReceived else 0L

        jobs[id] = job.copy(state = nextState, bytesReceived = keptBytes, lastError = error)
    }

    /**
     * 通信が切れたときに呼ぶ。転送中だったものを保留に移す。
     * 完了済みのものには触れません。
     * @return 保留に移した件数
     */
    fun onDisconnected(): Int {
        val interrupted = jobs.values.filter { it.state == TransferState.IN_PROGRESS }
        interrupted.forEach { fail(it.item.id, TransferError.ConnectionLost) }
        return interrupted.size
    }

    /**
     * 再接続できたときに呼ぶ。保留中のものを待機中に戻し、自動で再開できるようにする。
     * @return 待機中に戻した件数
     */
    fun releaseHeld(): Int {
        val held = jobs.values.filter { it.state == TransferState.HELD }
        for (job in held) {
            jobs[job.item.id] = job.copy(state = TransferState.PENDING)
        }
        return held.size
    }

    /**
     * このファイルを何バイト目から取り直せばよいか。
     *
     * 途中から再開できる機種なら、受け取り済みのバイト数。
     * できない／未確認なら 0（最初から）。
     */
    fun resumeOffsetFor(id: String): Long {
        if (!canResume) return 0L
        return jobs[id]?.bytesReceived ?: 0L
    }

    /** 完了したものを記録に残す。二重取り込みを防ぐため、次回はこれを見て飛ばす。 */
    fun recordCompletedInto(index: SavedMediaIndex) {
        jobs.values.filter { it.state == TransferState.DONE }.forEach { index.record(it.item) }
    }

    fun job(id: String): TransferJob? = jobs[id]

    fun jobs(): List<TransferJob> = jobs.values.toList()

    fun countOf(state: TransferState): Int = jobs.values.count { it.state == state }

    /** まだやることが残っているか。 */
    fun hasWork(): Boolean =
        jobs.values.any { it.state == TransferState.PENDING || it.state == TransferState.HELD }

    /** 今の進み具合。 */
    fun progress(): Progress {
        val all = jobs.values
        val current = all.firstOrNull { it.state == TransferState.IN_PROGRESS }
        return Progress(
            total = all.size,
            done = countOf(TransferState.DONE),
            failed = countOf(TransferState.FAILED),
            held = countOf(TransferState.HELD),
            inProgress = countOf(TransferState.IN_PROGRESS),
            currentLabel = current?.let { SafeLog.fileLabel(it.item) },
            totalBytes = all.sumOf { it.item.sizeBytes },
            receivedBytes = all.sumOf {
                if (it.state == TransferState.DONE) it.item.sizeBytes else it.bytesReceived
            },
        )
    }
}
