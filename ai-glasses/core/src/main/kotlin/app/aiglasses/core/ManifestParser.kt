package app.aiglasses.core

/**
 * グラスが返すファイル一覧（`media.config`）を読み取る係。
 *
 * **重要**: 実際の中身の形式は**まだ未確認**です（`docs/TRANSFER_SPEC.md` 参照）。
 * そのため、読み取り方を差し替えられるように入口だけを決めています。
 * 実機で本物の応答が取れたら、その形式用の実装を1つ足すだけで済みます。
 */
interface ManifestParser {
    fun parse(raw: String): ManifestResult
}

/**
 * 読み取り結果。
 *
 * 1行だけ壊れていても、他の行は使えるようにしています。
 * 「全部読めないと1枚も取り込めない」では、ユーザーが困るためです。
 */
data class ManifestResult(
    val items: List<MediaItem>,
    /** 読み取れなかった行。数と理由だけを持ち、中身はログに出さない。 */
    val skippedLines: List<String> = emptyList(),
) {
    val hasItems: Boolean get() = items.isNotEmpty()
}

/**
 * 区切り文字で並んだ一覧を読み取る、ゆるい実装。
 *
 * 想定する形（列の順番は設定で変えられます）:
 * ```
 * IMG_0001.JPG,204800,photo,1756400000000,/files/IMG_0001.JPG
 * ```
 *
 * 空行と `#` で始まる行は読み飛ばします。
 */
class DelimitedManifestParser(
    private val delimiter: Char = ',',
    private val columns: Columns = Columns(),
) : ManifestParser {

    /** 何列目に何が入っているか。実機の応答に合わせて変える。 */
    data class Columns(
        val name: Int = 0,
        val size: Int = 1,
        val type: Int = 2,
        val createdAt: Int = 3,
        val path: Int = 4,
    )

    override fun parse(raw: String): ManifestResult {
        val items = mutableListOf<MediaItem>()
        val skipped = mutableListOf<String>()

        for (line in raw.lineSequence()) {
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("#")) continue

            val parsed = parseLine(trimmed)
            if (parsed != null) items += parsed else skipped += trimmed
        }
        return ManifestResult(items = items, skippedLines = skipped)
    }

    private fun parseLine(line: String): MediaItem? {
        val cells = line.split(delimiter).map { it.trim() }
        val name = cells.getOrNull(columns.name)?.takeIf { it.isNotEmpty() } ?: return null
        val size = cells.getOrNull(columns.size)?.toLongOrNull() ?: return null
        if (size < 0) return null

        val path = cells.getOrNull(columns.path)?.takeIf { it.isNotEmpty() } ?: "/files/$name"

        return MediaItem(
            // グラスが id をくれない形式なので、パスを id 代わりにする。
            // パスは機種内で一意なはずだが、重複防止は fingerprint でも二重に守っている。
            id = path,
            name = name,
            type = typeOf(cells.getOrNull(columns.type), name),
            sizeBytes = size,
            createdAtEpochMs = cells.getOrNull(columns.createdAt)?.toLongOrNull(),
            downloadPath = path,
        )
    }

    private fun typeOf(rawType: String?, name: String): MediaType {
        rawType?.lowercase()?.let {
            when {
                it.startsWith("photo") || it.startsWith("image") || it == "jpg" -> return MediaType.PHOTO
                it.startsWith("video") || it.startsWith("movie") -> return MediaType.VIDEO
            }
        }
        // 種類の列が無い機種のために、拡張子からも推測する。
        return when (SafeLog.extensionOf(name)) {
            "jpg", "jpeg", "png", "heic", "webp" -> MediaType.PHOTO
            "mp4", "mov", "avi", "mkv" -> MediaType.VIDEO
            else -> MediaType.UNKNOWN
        }
    }
}
