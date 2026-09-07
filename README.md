# Disney+ Edge Enhanced

Windows版Microsoft Edgeで、Disney+の再生要求・PlayReady・映像の実寸法とフレーム進行を調べる実験用拡張機能です。Manifest V3拡張とユーザースクリプトを同梱しています。

**1080p SDRの約70秒の連続再生を確認。4K再生は未達です。**

> [!WARNING]
> **4K HDR / ハードウェアPlayReadyの実験では、PC全体のフリーズ・ブルースクリーンが発生しました。** 原因は未確定です。タイマーや再試行ガードではOS・GPUドライバーの停止を防げません。通常視聴用の完成品ではなく、4K/HDRモードの日常利用は推奨しません。未保存の作業がある環境で試さず、同じ条件で停止した場合は繰り返さないでください。1080pにも無事故・長時間再生の保証はありません。

[ダウンロード（実験版）](https://github.com/ioridev/disney-plus-edge-enhanced/releases) · [確認できたこと](docs/diagnostics.md) · [プライバシー](PRIVACY.md)

## 現状

| 項目 | 確認状況 |
| --- | --- |
| 1080p SDR | 2026-09-08、v0.3.13・Edge Betaの既存プロファイルで約70秒の実再生。最終1706フレーム、drop 0 |
| 通常視聴・作品全編 | 未確認。成功した単一候補モードはSDK開始から75秒で意図的に停止する診断モード |
| 公開版v0.3.16 | 後続の診断・ガード更新を含むスナップショット。公開準備で実再生を再検証したものではない |
| 4K SDR / HDR | 実フレーム進行による成功確認なし。manifestに3840×2160があっても再生成功ではない |
| NVIDIA / 内蔵GPU / Edge Stable | この公開記録では比較未完了。全GPU・全Edgeチャンネルへの一般化はできない |

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

## インストール

1. [Releases](https://github.com/ioridev/disney-plus-edge-enhanced/releases)から `disney-plus-edge-enhanced-v0.3.16.zip` をダウンロードし、保持できる場所に展開します。GitHubのソースZIPでも構いません。
2. Edgeで `edge://extensions` を開き、**開発者モード**をオンにします。
3. **展開して読み込み（Load unpacked）**から、展開先の **`extension` フォルダー**を選びます。`manifest.json` が入っているフォルダーです。
4. Disney+のページを新しく開くか再読み込みし、右下に **Disney+ Edge Enhanced v0.3.16** が表示されることを確認します。ページ上で起動するため、ツールバーのボタンやポップアップはありません。
5. 最初に**「無変更」**であることを確認してください。新規導入時の既定値は無変更です。旧Helperと保存キーを共有するため、以前に保存した単純な要求モードが残っていれば、無変更へ戻してください。

同時に旧Helper、別の画質変更拡張、ユーザースクリプト版を有効にしないでください。すでに注入済みのコードは拡張をオフにしただけでは消えないので、Disney+タブも再読み込みするか閉じます。更新時は展開ファイルを更新したうえで拡張一覧の再読み込みを押し、Disney+ページも再読み込みします。

ユーザースクリプト版は `DisneyPlus-Edge-Enhanced.user.js` です。ページ本体の実行領域への `document-start` 注入に対応する管理拡張が必要です。今回の実再生記録は展開したMV3拡張によるもので、各スクリプト管理拡張との互換性は未検証です。

## 1080pを比較する場合

1. 上記の前提・注意事項を確認し、4K/HDRモードではなく **「1080p SDR・HEVC/AACを1候補に固定（75秒比較）」**を選びます。選択するとページが再読み込みされます。
2. そのページで作品を1回再生します。自動再試行はしません。比較中に音声変更・シーク・別モードへの切替を重ねないでください。
3. `1920×1080`だけでなく、時間とフレーム数の増加、エラーの有無を確認します。`edge://media-internals`の該当プレーヤーでも接続CDM・解像度・codecを確認できます。
4. SDK開始から**75秒**で停止します。起動時間を含むため、実映像が75秒流れるという意味ではありません。時間制限による予定停止と、復号・ライセンスエラーを区別します。
5. 比較後は「無変更」に戻すかタブを閉じます。この単一候補実験は1ページ限定で、次の再読み込み・再起動で自動再開しません。

このモードは**長時間1080p視聴を有効化する完成機能ではありません**。単一候補化しても時間経過による鍵切替は残り得ます。75秒制限を外して検証済み扱いにしないでください。

「環境チェック」のEME API受付はCDMの実使用を示しません。「接続CDM / 鍵」と実フレームを確認します。「診断をコピー」は手動操作時だけクリップボードへ書き込みます。パネルは「縮小」または `Alt+Shift+4` で開閉できます。

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

Experimental Windows Edge extension for inspecting Disney+ playback requests, actual video dimensions, frame progress, and PlayReady state. About 70 seconds of real 1080p SDR playback was observed with v0.3.13 on Edge Beta; v0.3.16 is the published diagnostic snapshot, not a new hardware playback validation. **4K playback is not achieved. Full-title playback is unverified.** The single-FHD comparison intentionally stops 75 seconds after SDK startup.

**Hardware PlayReady / 4K HDR tests have frozen the entire PC or caused a BSOD. Software timers cannot prevent OS/GPU hangs.** This is not a stable viewing enhancement, DRM bypass, key extractor, or downloader. Keep legitimate subscription and playback permissions. The comparison settings are PlayReady enabled, Widevine disabled, hardware acceleration enabled, HEVC available, and a full Edge restart; restore changed flags afterward. Load the `extension` directory unpacked and start in the unchanged mode. MIT licensed; no affiliation with Disney or Microsoft.
