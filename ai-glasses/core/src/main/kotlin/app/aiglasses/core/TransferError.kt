package app.aiglasses.core

/**
 * 転送が失敗したときの理由。
 *
 * 要件: 「エラー表示には必ず次の操作を付ける」。
 * そのため、どのエラーも [userMessage]（何が起きたか）と
 * [nextAction]（次に何をすればよいか）を必ず持ちます。
 *
 * 言葉づかいの決まり:
 * - 専門用語を使わない
 * - ユーザーを責めない
 * - 「失敗しました」で終わらせない
 */
sealed class TransferError {
    /** 画面に大きく出す「何が起きたか」。 */
    abstract val userMessage: String

    /** その下に出す「次に何をすればよいか」。 */
    abstract val nextAction: String

    /**
     * 自動でやり直してよいか。
     *
     * false のものは、ユーザーが何かしない限り何度やっても同じ結果になります。
     * 自動リトライで電池と時間を浪費しないための区別です。
     */
    abstract val retryable: Boolean

    /** スマホの空き容量が足りない。 */
    data object InsufficientStorage : TransferError() {
        override val userMessage = "スマホの空き容量が足りません"
        override val nextAction = "いらない写真や動画を消してから、もう一度お試しください"
        override val retryable = false
    }

    /** 転送の途中で通信が切れた。取り込み済みのデータは消さない。 */
    data object ConnectionLost : TransferError() {
        override val userMessage = "途中で通信が切れました"
        override val nextAction = "取り込めた分は残っています。「もう一度つなぐ」を押すと続きから再開します"
        override val retryable = true
    }

    /** グラスのWi-Fiにつながらなかった。 */
    data object WifiConnectFailed : TransferError() {
        override val userMessage = "メガネのWi-Fiにつながりませんでした"
        override val nextAction = "メガネをスマホに近づけて、「もう一度つなぐ」を押してください"
        override val retryable = true
    }

    /** Bluetoothがオフになっている。 */
    data object BluetoothOff : TransferError() {
        override val userMessage = "スマホのBluetoothがオフになっています"
        override val nextAction = "設定でBluetoothをオンにしてください。下のボタンから設定を開けます"
        override val retryable = false
    }

    /** グラスが見つからない。 */
    data object DeviceNotFound : TransferError() {
        override val userMessage = "メガネが見つかりません"
        override val nextAction = "メガネの電源が入っているか確認し、スマホに近づけてください"
        override val retryable = false
    }

    /** アプリの権限が足りない。 */
    data object PermissionDenied : TransferError() {
        override val userMessage = "このアプリに、あと少しだけ許可が必要です"
        override val nextAction = "下のボタンから設定を開いて、許可をオンにしてください"
        override val retryable = false
    }

    /** グラスがファイルを渡してくれなかった。 */
    data class HttpError(val statusCode: Int) : TransferError() {
        override val userMessage = "メガネが写真を渡せませんでした"

        /** 5xx はグラス側の一時的な不調なのでやり直す価値がある。4xx は何度やっても同じ。 */
        override val retryable = statusCode in 500..599

        override val nextAction: String
            get() = if (retryable) "少し待ってから、もう一度お試しください"
            else "メガネの電源を入れ直してから、もう一度お試しください"
    }

    /**
     * 受け取ったファイルの大きさが、一覧に書かれていた大きさと違う。
     * 壊れたファイルを保存しないための検査で見つかる。
     */
    data class SizeMismatch(val expectedBytes: Long, val actualBytes: Long) : TransferError() {
        override val userMessage = "写真をすべて受け取れませんでした"
        override val nextAction = "壊れた写真は保存していません。「もう一度つなぐ」を押すとやり直します"
        override val retryable = true
    }
}
