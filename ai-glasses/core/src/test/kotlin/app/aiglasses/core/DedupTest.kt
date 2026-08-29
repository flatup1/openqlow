package app.aiglasses.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DedupTest {

    @Test
    fun `すでに取り込み済みのものは選ばれない`() {
        val index = InMemorySavedMediaIndex()
        val already = photo("A")
        index.record(already)

        val selected = Deduplicator(index).selectNew(listOf(already, photo("B")))

        assertEquals(listOf("B"), selected.map { it.id })
    }

    @Test
    fun `idが変わっても名前とサイズと日時が同じなら二重に取り込まない`() {
        val index = InMemorySavedMediaIndex()
        index.record(photo(id = "old-id", name = "IMG_1.JPG", size = 500))

        // グラスが再起動して id が振り直された想定
        val sameFileNewId = photo(id = "new-id", name = "IMG_1.JPG", size = 500)
        val selected = Deduplicator(index).selectNew(listOf(sameFileNewId))

        assertTrue(selected.isEmpty(), "同じファイルなのに新規と判定された")
    }

    @Test
    fun `一覧の中に同じものが二回出てきても一つにまとめる`() {
        val index = InMemorySavedMediaIndex()
        val dup = photo("A")

        val selected = Deduplicator(index).selectNew(listOf(dup, dup, photo("B")))

        assertEquals(listOf("A", "B"), selected.map { it.id })
    }

    @Test
    fun `名前が同じでもサイズが違えば別のファイルとして扱う`() {
        val index = InMemorySavedMediaIndex()
        index.record(photo(id = "x", name = "IMG_1.JPG", size = 500))

        val selected = Deduplicator(index)
            .selectNew(listOf(photo(id = "y", name = "IMG_1.JPG", size = 900)))

        assertEquals(1, selected.size, "サイズ違いは別ファイルとして取り込むべき")
    }

    @Test
    fun `選ばれた順番は元の一覧のままにする`() {
        val index = InMemorySavedMediaIndex()
        val selected = Deduplicator(index).selectNew(listOf(photo("C"), photo("A"), photo("B")))
        assertEquals(listOf("C", "A", "B"), selected.map { it.id })
    }

    @Test
    fun `新規と取り込み済みの件数を数えられる`() {
        val index = InMemorySavedMediaIndex()
        index.record(photo("A"))

        val summary = Deduplicator(index).summarize(listOf(photo("A"), photo("B"), photo("C")))

        assertEquals(3, summary.totalListed)
        assertEquals(2, summary.newCount)
        assertEquals(1, summary.alreadyHaveCount)
    }
}
