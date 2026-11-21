package app.aiglasses.core

/** 写真か動画か。判別できないものは UNKNOWN にする（推測で断定しない）。 */
enum class MediaType { PHOTO, VIDEO, UNKNOWN }

/**
 * グラスの中にある1つのファイル。
 *
 * グラスから受け取った情報をそのまま持つだけの入れ物です。
 * ここには「まだ取り込んでいない」などのアプリ側の状態は入れません。
 * 状態は [TransferJob] が持ちます。
 */
data class MediaItem(
    /** グラス側の識別子。機種によっては信用できないので、単独で頼らない。 */
    val id: String,
    val name: String,
    val type: MediaType,
    val sizeBytes: Long,
    /** 撮影日時。取れない機種があるので null を許す。 */
    val createdAtEpochMs: Long? = null,
    /** グラス上のダウンロード先パス。 */
    val downloadPath: String,
) {
    init {
        require(id.isNotBlank()) { "id が空です" }
        require(sizeBytes >= 0) { "sizeBytes が負の値です: $sizeBytes" }
    }

    /**
     * id が信用できない機種のための代替の指紋。
     *
     * 「名前 + サイズ + 撮影日時」の組み合わせで同じファイルかを判定します。
     * 完璧ではありませんが、id だけに頼るより二重保存を防げます。
     */
    fun fingerprint(): String = "$name|$sizeBytes|${createdAtEpochMs ?: "?"}"
}
