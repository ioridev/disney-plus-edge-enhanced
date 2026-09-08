# 出典と第三者の権利

Disney+ Edge Enhancedの独自コードは[MIT License](LICENSE)で公開しています。Disney+ / Microsoft / GPUメーカーとの提携・承認を示すものではありません。各名称・商標はそれぞれの権利者に属します。

READMEのヘッダー画像は本プロジェクト用にAI生成したイラストです。公式ロゴや作品映像ではなく、製品・サービスとの提携を示すものではありません。

調査中には、次の公開資料・先行実装を参照しました。

- [SpaceSaver — FHD Disney+ For Chromebooks](https://gist.github.com/SpaceSaver/5e686a1f129ef456e6a94012f59991c3): 再生要求やHLS候補を扱う先行ユーザースクリプトとして参照。コードは本リポジトリへ取り込んでいません。
- [RFC 8216 — HTTP Live Streaming](https://www.rfc-editor.org/rfc/rfc8216): HLS master/media playlistと各タグの区別を実装・検証する際の資料。
- [W3C — Encrypted Media Extensions](https://www.w3.org/TR/encrypted-media/): CDM・MediaKeys・MediaKeySession・鍵状態を区別するための仕様。
- [Chrome Extensions — action](https://developer.chrome.com/docs/extensions/reference/api/action)、[contextMenus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)、[scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting): ツールバー操作・バッジ・右クリック項目・固定コマンド実行の公式API資料。
- [fregante/webext-permission-toggle](https://github.com/fregante/webext-permission-toggle): 拡張アクションのトグルUIの先行OSSとして参照。依存追加・コード取り込みは行っていません。
- [Khronos — WEBGL_debug_renderer_info](https://registry.khronos.org/webgl/extensions/WEBGL_debug_renderer_info/): GPU参考判定のAPI仕様。[pmndrs/detect-gpu](https://github.com/pmndrs/detect-gpu)も先行OSSとして調査しましたが、コード・ベンチマークデータの取り込みや依存追加はしていません。

サービスのSDK名・設定フィールド・公開ホスト名は相互運用対象を特定するためにコード内に現れますが、サービスSDK本体やCDMを再配布するものではありません。テストは独自のモックと人工的なplaylistを使い、実SDKをダウンロードする調査用テストは公開物に含めていません。MITライセンスは第三者のサービス・映像・SDK・商標に対する権利を付与しません。
