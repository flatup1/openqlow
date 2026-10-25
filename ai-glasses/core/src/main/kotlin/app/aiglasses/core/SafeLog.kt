package app.aiglasses.core

/**
 * ログに残してはいけないものを消す係。
 *
 * 要件:
 * - 秘密情報、APIキー、Wi-Fiパスワードをログへ平文で残さない
 * - ログには個人の写真名や会話内容を必要以上に残さない
 *
 * 不具合を追うのに必要な情報は残しつつ、
 * 「他人に見られて困るもの」だけを消すのが目的です。
 */
object SafeLog {

    private const val MASK = "****"

    /** 秘密情報を表す語。これらの「値」だけを隠す。 */
    private const val SECRET_KEYS = """password|passwd|pwd|psk|passphrase|secret|token|api[_-]?key"""

    /**
     * `"psk":"xxx"` のように値が引用符で囲まれている書き方。
     * グループ: 1=語 2=区切り(閉じ引用符・コロン・開き引用符を含む) 3=値 4=閉じ引用符
     */
    private val quotedSecret = Regex("""(?i)\b($SECRET_KEYS)\b(["']?\s*[:=]\s*["'])([^"']*)(["'])""")

    /**
     * `password=xxx` のように値が裸の書き方。
     * グループ: 1=語 2=区切り 3=値
     */
    private val bareSecret = Regex("""(?i)\b($SECRET_KEYS)\b(["']?\s*[:=]\s*)([^\s,;}"']+)""")

    /**
     * 文字列の中の秘密情報を隠す。
     *
     * 隠すのは「値」だけです。SSIDやIPアドレスは不具合を追うのに必要なので残します。
     *
     * 例: `ssid=GLASS-A1 password=hunter2` → `ssid=GLASS-A1 password=****`
     */
    fun redact(text: String): String {
        // 引用符つきを先に処理する。先に裸のほうを当てると、引用符の中で中途半端に消えるため。
        var result = quotedSecret.replace(text) { m ->
            m.groupValues[1] + m.groupValues[2] + MASK + m.groupValues[4]
        }
        result = bareSecret.replace(result) { m ->
            m.groupValues[1] + m.groupValues[2] + MASK
        }
        return result
    }

    /**
     * ログに書いてよいファイルの呼び名。
     *
     * 実際のファイル名（例: `娘の誕生日.jpg`）は個人情報になりうるので書きません。
     * 代わりに「種類 + 短い番号」にします。同じファイルは必ず同じ呼び名になるので、
     * 不具合を追うときはこれで足ります。
     *
     * 例: `写真#3f8a1c`
     */
    fun fileLabel(item: MediaItem): String {
        val kind = when (item.type) {
            MediaType.PHOTO -> "写真"
            MediaType.VIDEO -> "動画"
            MediaType.UNKNOWN -> "ファイル"
        }
        return "$kind#${shortHash(item.id)}"
    }

    /** 拡張子だけは残してよい（中身の推測に使えないため）。 */
    fun extensionOf(name: String): String =
        name.substringAfterLast('.', missingDelimiterValue = "").lowercase()

    private fun shortHash(value: String): String {
        // 暗号用途ではありません。ログを見比べるための短い目印です。
        var h = 2166136261u
        for (c in value) {
            h = h xor c.code.toUInt()
            h *= 16777619u
        }
        return h.toString(16).padStart(8, '0').take(6)
    }
}
