package app.aiglasses.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PartFileTest {

    @Test
    fun `書き込み中は一時ファイル名を使う`() {
        assertEquals("IMG_0042.JPG.part", PartFile.partNameOf("IMG_0042.JPG"))
    }

    @Test
    fun `受け取り終わったら正式な名前に戻す`() {
        assertEquals("IMG_0042.JPG", PartFile.finalNameOf("IMG_0042.JPG.part"))
    }

    @Test
    fun `一時ファイルかどうか見分けられる`() {
        assertTrue(PartFile.isPart("IMG_0042.JPG.part"))
        assertFalse(PartFile.isPart("IMG_0042.JPG"))
    }

    @Test
    fun `正式な名前をそのまま渡しても壊れない`() {
        assertEquals("IMG_0042.JPG", PartFile.finalNameOf("IMG_0042.JPG"))
    }
}
