package app.aiglasses.core

/**
 * 転送の進み具合。
 *
 * 要件:
 * - 「10枚中3枚完了」のように表示する
 * - 完了、失敗、保留の件数を区別する
 * - 残り時間は正確に計算できる場合だけ表示する
 */
data class Progress(
    val total: Int,
    val done: Int,
    val failed: Int,
    val held: Int,
    val inProgress: Int,
    /** 今どのファイルを転送中か。安全のため実名ではなく [SafeLog.fileLabel] を入れる。 */
    val currentLabel: String?,
    val totalBytes: Long,
    val receivedBytes: Long,
) {
    /** 画面に出す一言。「10件中3件完了」 */
    fun label(): String = "${total}件中${done}件完了"

    /** 0.0〜1.0。まだ何も無いときは 0.0。 */
    fun fraction(): Double = if (totalBytes <= 0L) 0.0 else receivedBytes.toDouble() / totalBytes

    /**
     * 残り何秒か。**正確に計算できないときは null を返す**（要件どおり）。
     *
     * null を返す条件:
     * - まだ1バイトも受け取っていない
     * - 経過時間が短すぎて速度がぶれる（3秒未満）
     * - 全体の大きさが分からない
     * - すでに全部受け取り終わっている
     */
    fun estimateRemainingSeconds(elapsedMs: Long): Long? {
        if (receivedBytes <= 0L) return null
        if (elapsedMs < MIN_ELAPSED_MS) return null
        if (totalBytes <= 0L) return null
        val remainingBytes = totalBytes - receivedBytes
        if (remainingBytes <= 0L) return null
        val bytesPerMs = receivedBytes.toDouble() / elapsedMs
        if (bytesPerMs <= 0.0) return null
        return (remainingBytes / bytesPerMs / 1000.0).toLong().coerceAtLeast(1L)
    }

    private companion object {
        /** これより短い時間で残り時間を出すと、数字が大きく揺れて逆に不安にさせる。 */
        const val MIN_ELAPSED_MS = 3_000L
    }
}
