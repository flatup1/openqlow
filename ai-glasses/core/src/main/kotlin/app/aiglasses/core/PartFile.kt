package app.aiglasses.core

/**
 * 壊れた写真を残さないための、一時ファイルの名前の決まり。
 *
 * 要件: 「一時ファイルへ保存し、完全に受信できた後で正式ファイルへ切り替える」
 *
 * 手順:
 * 1. ダウンロード中は `IMG_0042.jpg.part` に書く
 * 2. 最後まで受け取れて、大きさも合っていたら `IMG_0042.jpg` に名前を変える
 * 3. 途中で切れたら `.part` のまま残す（続きから再開するため）
 *
 * こうすると、正式な名前のファイルは「完全なものだけ」になります。
 */
object PartFile {
    const val SUFFIX = ".part"

    /** 書き込み中の一時ファイル名。 */
    fun partNameOf(finalName: String): String = finalName + SUFFIX

    /** 一時ファイル名から正式な名前へ戻す。一時ファイルでなければそのまま返す。 */
    fun finalNameOf(partName: String): String = partName.removeSuffix(SUFFIX)

    fun isPart(name: String): Boolean = name.endsWith(SUFFIX)
}
