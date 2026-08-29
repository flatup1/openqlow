package app.aiglasses.core

/**
 * すでにスマホへ取り込み済みのファイルの記録。
 *
 * 実際の保存先（Room や DataStore）はAndroid側で用意します。
 * このモジュールはAndroidに依存しないので、入口だけを決めています。
 */
interface SavedMediaIndex {
    fun containsId(id: String): Boolean
    fun containsFingerprint(fingerprint: String): Boolean
    /** 取り込みが完全に終わったものだけを記録する。途中のものは記録しない。 */
    fun record(item: MediaItem)
}

/** テストと、まだ保存先が無い段階で使う、メモリ上だけの記録。 */
class InMemorySavedMediaIndex : SavedMediaIndex {
    private val ids = mutableSetOf<String>()
    private val fingerprints = mutableSetOf<String>()

    override fun containsId(id: String) = id in ids
    override fun containsFingerprint(fingerprint: String) = fingerprint in fingerprints

    override fun record(item: MediaItem) {
        ids += item.id
        fingerprints += item.fingerprint()
    }

    val size: Int get() = ids.size
}

/**
 * 同じ写真を二重に保存しないための選別。
 *
 * 要件: 「同じファイルを重複して保存しない」「同じメディアが意図せず重複保存されない」。
 *
 * 2段階で判定します。
 * 1. グラスがくれた id が、すでに記録にあるか
 * 2. id が違っても「名前・大きさ・撮影日時」が同じものが記録にあるか
 *
 * さらに、グラスがくれた一覧の中に同じものが2回出てきた場合も1つにまとめます。
 * （機種によっては一覧が重複することがあるため）
 */
class Deduplicator(private val index: SavedMediaIndex) {

    /** まだ取り込んでいないものだけを、元の順番のまま返す。 */
    fun selectNew(items: List<MediaItem>): List<MediaItem> {
        val seenIds = mutableSetOf<String>()
        val seenFingerprints = mutableSetOf<String>()
        val result = mutableListOf<MediaItem>()

        for (item in items) {
            val fingerprint = item.fingerprint()

            // すでにスマホに入っている
            if (index.containsId(item.id)) continue
            if (index.containsFingerprint(fingerprint)) continue

            // 今回の一覧の中で、すでに拾っている
            if (item.id in seenIds) continue
            if (fingerprint in seenFingerprints) continue

            seenIds += item.id
            seenFingerprints += fingerprint
            result += item
        }
        return result
    }

    /** 何件が新しく、何件がすでに持っているものかを数える。画面表示用。 */
    fun summarize(items: List<MediaItem>): DedupSummary {
        val newItems = selectNew(items)
        return DedupSummary(totalListed = items.size, newCount = newItems.size)
    }
}

data class DedupSummary(val totalListed: Int, val newCount: Int) {
    val alreadyHaveCount: Int get() = totalListed - newCount
}
