package app.aiglasses.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ManifestParserTest {

    private val parser = DelimitedManifestParser()

    @Test
    fun `一覧を読み取れる`() {
        val raw = """
            IMG_0001.JPG,204800,photo,1756400000000,/files/IMG_0001.JPG
            MOV_0002.MP4,5242880,video,1756400600000,/files/MOV_0002.MP4
        """.trimIndent()

        val result = parser.parse(raw)

        assertEquals(2, result.items.size)
        assertEquals("IMG_0001.JPG", result.items[0].name)
        assertEquals(204_800L, result.items[0].sizeBytes)
        assertEquals(MediaType.PHOTO, result.items[0].type)
        assertEquals(MediaType.VIDEO, result.items[1].type)
    }

    @Test
    fun `空行とコメント行は読み飛ばす`() {
        val raw = """
            # このファイルはメガネが作ります

            IMG_0001.JPG,100,photo,1,/files/IMG_0001.JPG
        """.trimIndent()

        val result = parser.parse(raw)

        assertEquals(1, result.items.size)
        assertTrue(result.skippedLines.isEmpty(), "コメントは読み飛ばしであって読み取り失敗ではない")
    }

    @Test
    fun `一行だけ壊れていても他の行は取り込める`() {
        val raw = """
            IMG_0001.JPG,100,photo,1,/files/IMG_0001.JPG
            こわれた行
            IMG_0003.JPG,300,photo,3,/files/IMG_0003.JPG
        """.trimIndent()

        val result = parser.parse(raw)

        assertEquals(2, result.items.size, "1行の失敗で全部が取り込めなくなってはいけない")
        assertEquals(1, result.skippedLines.size)
    }

    @Test
    fun `種類の列が無くても拡張子から写真か動画かを判定する`() {
        val parser = DelimitedManifestParser(
            columns = DelimitedManifestParser.Columns(name = 0, size = 1, type = 9, createdAt = 9, path = 9),
        )
        val result = parser.parse("IMG_0001.HEIC,100\nMOV_0002.MOV,200")

        assertEquals(MediaType.PHOTO, result.items[0].type)
        assertEquals(MediaType.VIDEO, result.items[1].type)
    }

    @Test
    fun `パスの列が無ければファイル名から組み立てる`() {
        val parser = DelimitedManifestParser(
            columns = DelimitedManifestParser.Columns(name = 0, size = 1, type = 9, createdAt = 9, path = 9),
        )
        assertEquals("/files/IMG_0001.JPG", parser.parse("IMG_0001.JPG,100").items[0].downloadPath)
    }

    @Test
    fun `区切り文字を変えられる`() {
        val parser = DelimitedManifestParser(delimiter = '|')
        val result = parser.parse("IMG_0001.JPG|100|photo|1|/files/IMG_0001.JPG")
        assertEquals(1, result.items.size)
    }

    @Test
    fun `読み取った一覧をそのまま重複防止に渡せる`() {
        val raw = "IMG_0001.JPG,100,photo,1,/files/IMG_0001.JPG"
        val index = InMemorySavedMediaIndex()

        val first = Deduplicator(index).selectNew(parser.parse(raw).items)
        assertEquals(1, first.size)

        first.forEach { index.record(it) }

        val second = Deduplicator(index).selectNew(parser.parse(raw).items)
        assertTrue(second.isEmpty(), "二回目は取り込み済みとして飛ばすべき")
    }
}
