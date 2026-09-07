# Disney+ Edge Enhanced

Windows版Microsoft Edgeで、**ツールバーのアイコンをクリックしてDisney+のフルHD要求をON/OFF**にする拡張機能です。普段はページ上にUIを出さず、右クリックメニューから詳細なデバッグUIを開けます。Manifest V3拡張とユーザースクリプトを同梱しています。

**v0.4.0の通常フルHDモードには再生時間制限がありません。長時間の実再生は未検証、4K再生は未達です。** 実機で確認済みなのは、旧v0.3.13の1080p SDR約70秒です。

> [!WARNING]
> **4K HDR / ハードウェアPlayReadyの実験では、PC全体のフリーズ・ブルースクリーンが発生しました。** 原因は未確定です。UIを通常操作向けに整理したことや、時間制限を外したことは、実機での安定性を証明しません。タイマーやガードではOS・GPUドライバーの停止を防げません。4K/HDRモードの日常利用は推奨しません。未保存の作業がある環境で試さず、同じ条件で停止した場合は繰り返さないでください。1080pにも無事故・長時間再生の保証はありません。

[ダウンロード（実験版）](https://github.com/ioridev/disney-plus-edge-enhanced/releases) · [確認できたこと](docs/diagnostics.md) · [関連報告・修正情報](docs/related-issues.md) · [プライバシー](PRIVACY.md)

## 現状

| 項目 | 確認状況 |
| --- | --- |
| 1080p SDR | 2026-09-08、v0.3.13・Edge Betaの既存プロファイルで約70秒の実再生。最終1706フレーム、drop 0 |
| v0.4.0の通常フルHD | 75秒タイマー・SDK/再生POST/masterの1回制限を撤去。繰り返し要求と正規の鍵更新をモックで確認。長時間・作品全編の実再生は未確認 |
| v0.4.0のUI | 隔離したChromiumで通常時のUI非表示、デバッグ開閉、ページ側ON/OFF操作後の再読み込みとバッジ連携を確認。Edgeのネイティブなクリック・右クリック操作は実機未確認 |
| 4K SDR / HDR | 実フレーム進行による成功確認なし。manifestに3840×2160があっても再生成功ではない |
| NVIDIA / 内蔵GPU / Edge Stable | この公開記録では比較未完了。全GPU・全Edgeチャンネルへの一般化はできない |

## 関連報告・修正情報

Chromium issue 544339013（出力色深度とPlayReadyの報告）、AMD 26.9.1の公開修正一覧、Microsoft Q&AのRX 9070 XTフリーズ報告、Windows 25H2の別DRM修正を、[出典・確認範囲つきで整理しています](docs/related-issues.md)。

**本拡張でのフリーズと同一原因だと確認したものではありません。** Chromiumの原典全文・最新解決状態は未取得、AMDの修正一覧に記載がないことは未修正の証明ではありません。WindowsのBlu-ray/DVD/TV向け修正も、今回のストリーミング不具合の修正とは混同しません。

## できること・しないこと

- 明示的に選んだモードで、対象の再生要求のシナリオ・解像度上限や、対応SDKのセッション設定を限定変更します。
- 対応するHLS masterから既存のHEVC/AAC候補を1本に絞る診断を行います。音声・字幕・鍵宣言や、映像の実解像度を偽装するものではありません。
- manifest候補、動画の寸法、時間・フレーム進行、実際に接続したCDM、鍵状態の件数を分けて表示します。
- **DRM解除、鍵抽出、ライセンス偽造、動画ダウンロード、HDCP判定の偽装は行いません。** 正規のログイン・視聴権限・CDM・出力条件が必要です。サービス側が許可しない品質は保証できません。
- Disney+、Microsoft、各GPUメーカーの公式製品ではありません。映像・ロゴ・サービスSDK・CDMは配布していません。

## Edgeの設定（実験の前提）

**拡張を入れるだけでは、確認済みの比較条件は揃いません。** 以下は今回の実験条件であり、Disney+公式の4K有効化手順ではありません。変更前の値を記録してください。

1. 試すWindows版Edgeで `edge://flags` を開き、Windows用の **PlayReady DRM** を **Enabled** にします。
2. 同じEdgeの **Widevine DRM** を **Disabled** にします。別CDMへのフォールバックを比較結果と取り違えないための条件です。他の動画サイトに影響することがあるので、調査後は元の値へ戻してください。
3. Edgeの「システムとパフォーマンス」で、利用可能な場合の**グラフィックス／ハードウェアアクセラレーションをオン**にします。
4. **Edge本体を再起動**して反映します。タブの再読み込みだけでは不十分です。フリーズした実験タブは自動復元・自動再生しないでください。
5. Windowsで **HEVC Video Extensions** が利用可能か確認します。インストール済みなら買い直す必要はありません。コーデックの存在だけで保護再生の成功は保証されません。

フラグの名前・有無はEdgeの版によって異なります。見つからなければ、その版では前提を未確認として扱い、未確認のレジストリ変更などで代替しないでください。Edge Devを別に入れても、普段のEdgeの設定は引き継がれたとは限りません。

Windows HDR、出力色深度（bpc）、Hz、GPU/MUX、ドライバー、SVM/VBSは別の比較条件です。一度に変更しないでください。8 bpcにすればフリーズを回避できる、という結果は得られていません。

## インストール・更新

1. [Releases](https://github.com/ioridev/disney-plus-edge-enhanced/releases)から `disney-plus-edge-enhanced-v0.4.0.zip` をダウンロードし、保持できる場所に展開します。GitHubのソースZIPでも構いません。
2. Edgeで `edge://extensions` を開き、**開発者モード**をオンにします。
3. **展開して読み込み（Load unpacked）**から、展開先の **`extension` フォルダー**を選びます。`manifest.json` が入っているフォルダーです。
4. Edgeの拡張機能メニューから **Disney+ Edge Enhanced** をツールバーに表示／ピン留めします。
5. Disney+ページを再読み込みします。新規導入時はバッジが **OFF** で、ページ上のパネルは出ません。旧Helperの設定を引き継いで **DBG** と出た場合は、右クリックのデバッグUIで「無変更」に戻してから使ってください。

同時に旧Helper、別の画質変更拡張、ユーザースクリプト版を有効にしないでください。すでに注入済みのコードは拡張をオフにしただけでは消えないので、Disney+タブも再読み込みするか閉じます。**更新時は拡張フォルダー全体を更新**し、拡張一覧の再読み込みを押してDisney+ページも再読み込みします。v0.4.0ではツールバー用のファイルと権限が追加されているため、本体JSだけの差し替えでは更新できません。

ユーザースクリプト版は `DisneyPlus-Edge-Enhanced.user.js` です。ページ本体の実行領域への `document-start` 注入に対応する管理拡張が必要です。専用のツールバーボタンはないため、`Alt+Shift+4` でデバッグUIを開いてモードを選びます。今回の実再生記録は展開したMV3拡張によるもので、各スクリプト管理拡張との互換性は未検証です。

## 普段の操作

1. Disney+タブで拡張アイコンをクリックすると、フルHD要求を **ON** にして、そのタブだけ再読み込みします。作品の再生操作はDisney+側で行います。
2. もう一度クリックすると **OFF（無変更）** に戻して、そのタブだけ再読み込みします。拡張自身がEdgeを再起動したり、他のタブを再読み込みしたりすることはありません。
3. 調べたいときだけ、アイコンを右クリックして **「デバッグUIを表示／非表示」** を選びます。通常は再読み込みも再生モードの変更もしません。既存ページに新版本体が未注入の場合だけ、読み込みのため一度再読み込みします。

右クリック単独でページUIを開くのではなく、Edge標準の右クリックメニューに項目を追加する方式です。`Alt+Shift+4` でも開閉でき、パネルの「閉じる」で隠せます。デバッグUIの表示状態はタブのsessionStorageに保持します。

| バッジ | 意味 |
| --- | --- |
| OFF | 再生設定は無変更 |
| HD | 通常フルHD要求がON。**実際に1080pで再生できている証拠ではありません** |
| DBG | デバッグUIで選んだ別の要求・診断モード |
| ! | 操作または再生のエラー。右クリックからデバッグUIを確認 |

ON/OFFはDisney+のlocalStorageに保存し、次回開くDisney+ページでも使います。同じoriginのタブ間で共有される設定ですが、既に再生中の他タブのモードを即座に切り替えるものではありません。

通常フルHDは、既存の1920×1080・SDR・HEVC/AAC候補を1本選びます。**再生時間で停止せず、SDKセッション作成・再生要求・master再取得・正規の鍵更新を1回で打ち切りません。** 拡張自身が自動再生やエラー時の再試行を行うものではなく、認証・ライセンス・回線・サービス側の問題までは解消しません。

候補が見つからない、SDK構造が未対応、DRM/映像エラー、通信ガードの不成立などでは停止します。通常フルHDでこの停止が起きた場合は、保存設定もOFFへ戻し、次回読み込みで自動的に同じ処理を始めないようにします。OS全体がフリーズした場合は、この処理自体が実行できないことがあります。

## デバッグ・再生の確認

- `1920×1080`という宣言だけでなく、動画の実寸法・時間とフレーム数の増加を確認します。`edge://media-internals`でも接続CDM・解像度・codecを確認できます。
- 「環境チェック」のEME API受付はCDMの実使用を示しません。「接続CDM / 鍵」と実フレームを確認します。
- 「診断をコピー」は手動操作時だけクリップボードへ書き込みます。
- 旧 **「1080p SDR・HEVC/AACを1候補に固定（75秒比較）」** は短時間診断用として残しています。こちらはSDK開始から75秒で予定停止し、次の再読み込みで自動再開しません。普段の視聴では「フルHD（1080p SDR・時間制限なし）」を使います。
- 4K HDR単一候補の30秒制限など、危険な比較モードの制限は変更していません。

時間制限の撤去と実機での安定性は別です。作品全編、鍵切替・シーク・吹替変更、別作品やGPUでの継続再生は引き続き検証が必要です。

## 開発・テスト

Node.js 24以上を使います。拡張を利用するだけならNode.jsは不要です。npm依存パッケージのインストールも不要です。

```sh
npm test
npm run build
npm run build:check
```

`extension/DisneyPlus-Edge-Enhanced.user.js`が配布する本体です。`src/`のHLS選択・通信アダプターを編集した場合は `npm run build` で本体の埋め込み部分を更新します。それ以外の本体は同ファイルを直接編集します。

テストはNode VM上のfetch/XHR・SDK・EMEモックで実行し、実ネットワーク呼出しを検出するガードを読み込みます。ブラウザー・アカウント・本物のCDMは使いません。オフラインテストの成功を、実機での画質・安定性の証拠にはしません。

Windowsで配布ZIPを作る場合:

```powershell
powershell -NoProfile -File scripts/package.ps1
```

テスト後、明示したファイルだけを `dist/` に出力します。同じ版のZIPが既にある場合は上書きせず停止します。

## 報告・ライセンス

不具合報告には、Windows/Edge/GPU/ドライバーの版、選んだモード、前提設定、実寸法とフレーム進行、エラーの有無を添えてください。**HAR、Cookie、認証ヘッダー、完全なmanifestやライセンス応答、メモリダンプを公開Issueに貼らないでください。** コピーした診断も投稿前に確認してください。

[MIT License](LICENSE)。参考資料と第三者の権利については[NOTICE](NOTICE.md)を参照してください。

## English summary

Windows Edge extension with a one-click full-HD request toggle. Right-click its toolbar icon and choose the debug UI item for diagnostics; the page overlay is hidden by default. v0.4.0 adds a normal full-HD mode without the old 75-second duration or one-SDK/POST/master limits. The HD badge indicates the requested mode, not verified picture quality. Native errors still stop the mode and reset the saved preference to OFF.

About 70 seconds of real 1080p SDR playback was observed with v0.3.13 on Edge Beta. v0.4.0 was checked with offline mocks and an isolated Chromium UI fixture, not a new hardware playback run. **4K playback is not achieved. Long-running/full-title playback is unverified.** The separate diagnostic modes retain their 75-second FHD and 30-second HDR limits.

**Hardware PlayReady / 4K HDR tests have frozen the entire PC or caused a BSOD. Software timers cannot prevent OS/GPU hangs.** This is not a DRM bypass, key extractor, or downloader. Keep legitimate subscription and playback permissions. Prerequisites used in the comparison were PlayReady enabled, Widevine disabled, hardware acceleration enabled, HEVC available, and a full Edge restart; restore changed flags afterward. Load the entire `extension` directory unpacked, pin its icon, and start in OFF. MIT licensed; no affiliation with Disney or Microsoft.
