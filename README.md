# Disney+ Edge Enhanced

| GPU・接続構成 | 利用できる画質 | 外部モニター利用時 |
| --- | --- | --- |
| Intel内蔵GPU（処理・出力） | 4K HDR | Intel側につながる映像端子を使用 |
| NVIDIA / AMD dGPU | フルHD（1080p SDR）まで | 4K/HDRは本拡張では非推奨 |
| デュアルGPU（Intel + dGPU） | モニターの接続先GPUによる | 端子の物理接続先もIntelか確認 |

![Disney+ Edge Enhanced — フルHD・Intel向け4K（実験版）の非公式Edge拡張](docs/assets/readme-banner.png)

> [!WARNING]
> **AMD環境での4K/HDR（1080p HDR含む）再生時にフリーズやBSODが発生しています。**
> dGPUではSDR（フルHDまで）を使用し、一度フリーズした条件は繰り返さないでください。拡張のタイマー等でOSやドライバーの停止を防ぐことはできません。

Windows版Microsoft EdgeでDisney+の画質要求（フルHD / Intel向け4K）を切り替える非公式拡張機能です。DRM解除、鍵抽出、ライセンス偽造、HDCP偽装、動画ダウンロード等の機能はありません。正規の契約とログインが必要です。

検証機のIntel Iris Xe構成では約5分間の4K HDR再生を確認していますが、全Intel製品や全dGPUでの動作を保証するものではありません。dGPUの上限はGPU自体の性能限界ではなく本拡張の対応範囲です。詳細な数値や未確認項目の検証履歴は [docs/intel-4k.md](docs/intel-4k.md)、[docs/diagnostics.md](docs/diagnostics.md)、[docs/related-issues.md](docs/related-issues.md) を参照してください。

## 前提条件（Edgeの設定）

本拡張の動作条件を揃えるための設定です。Disney+公式の手順ではありません。フラグの有無はEdgeのバージョンで異なり、他サービスにも影響するため、元の値を控えて戻せるようにしてください。

1. `edge://flags` で **PlayReady DRM** を **Enabled** に設定する。
2. `edge://flags` で **Widevine DRM** を **Disabled** に設定する（他サービスへの影響に注意）。
3. Edgeの設定「システムとパフォーマンス」で **グラフィックス／ハードウェアアクセラレーション** をオンにする。
4. **Edge本体を再起動** する。
5. Windowsで **HEVCビデオ拡張機能** が利用可能か確認する。

## インストール・更新

1. [Releases](https://github.com/ioridev/disney-plus-edge-enhanced/releases) またはソースZIPをダウンロードして展開する。
2. Edgeで `edge://extensions` を開き、**開発者モード** をオンにする。
3. **展開して読み込み** から、展開先の `extension` フォルダー（`manifest.json` がある場所）を選択する。
4. ツールバーに拡張機能をピン留めし、Disney+のページを再読み込みする。

※ 他の画質変更スクリプトや拡張機能と重複して有効化しないでください。
※ 更新時はフォルダー全体を上書きし、`edge://extensions` で対象拡張の再読み込みボタンを押し、Disney+のタブも再読み込みしてください。

## 使い方

- **アイコン左クリック**: フルHD要求のON/OFFを切り替え、対象タブを再読み込みします。
- **アイコン右クリック**: 「4Kを開始（Intel GPU向け・このページのみ）」または「デバッグUIを表示／非表示」を選択できます（デバッグUIの開閉は `Alt+Shift+4` でも可能）。
- **4Kモードの挙動**: 4K要求はそのページ限り有効で、再読み込み後はOFFに戻ります。WebGLによるGPU判定を行いますが、物理的な出力経路を保証するものではありません。

| バッジ | 状態 |
| --- | --- |
| OFF | 通常再生（無変更） |
| HD | フルHD要求中（実画質の保証ではありません） |
| 4K | Intel向け4K要求中（このページ限りで有効） |
| DBG | デバッグUIで設定した診断モード |
| ! | エラー発生（デバッグUIを確認） |

ツールバーのバッジは要求モードを示すもので、実際の再生画質ではありません。動画の実寸法、再生時間、フレーム進行をデバッグUIで確認してください。

通常フルHDおよびIntel 4Kモードに短時間の強制終了タイマーはなく、自動再生やエラー時の自動再試行も行いません。診断用の時間制限モード等の詳細は [docs/diagnostics.md](docs/diagnostics.md) を参照してください。

## デュアルGPU環境で外部モニターを使う場合

Edgeの描画GPUとモニターが接続されているGPUが異なると、出力保護エラーで再生に失敗する場合があります。検証機ではNVIDIA側の端子で再生に失敗し、同じモニターをIntel側の端子に差し替えることで成功しました。

1. Windowsの「設定 > システム > ディスプレイ > グラフィック」で、Edgeの優先GPUを **Intel内蔵GPU** に指定し、Edgeを再起動する。
2. 「ディスプレイの詳細設定」で、対象モニターの接続先がIntelになっているか確認する。dGPUになっている場合は、Intel側に配線されている端子に接続し直す（USB-C、HDMI、Thunderboltといった規格名だけでは内部の配線先は判別できません）。
3. HDR表示を行う場合は、対象モニターのWindows HDRをあらかじめオンにする（拡張が自動で設定を変更することはありません）。

## 開発

拡張機能を利用するだけならNode.jsは不要です。

- 動作環境: Node.js 24以上
- テスト実行: `npm test`
- ビルド実行: `npm run build` / `npm run build:check`

`src/` 配下のHLS選択・通信アダプターを変更した場合は `npm run build` で埋め込みコードを再生成します。それ以外の本体の修正は `extension/DisneyPlus-Edge-Enhanced.user.js` を直接編集します。

## 不具合報告・ライセンス

不具合を報告する際は、OS、Edge、GPU、ドライバーの各バージョン、使用したモード、動画の実寸法、フレーム進行、エラー内容を記載してください。

> [!IMPORTANT]
> 公開IssueにHAR、Cookie、認証情報、完全なmanifest、ライセンス応答、メモリダンプ等を絶対に貼り付けないでください。

- ライセンス: [MIT License](LICENSE)
- サードパーティ表記: [NOTICE.md](NOTICE.md)
- プライバシーポリシー: [PRIVACY.md](PRIVACY.md)
- 関連ドキュメント: [docs/intel-4k.md](docs/intel-4k.md) / [docs/diagnostics.md](docs/diagnostics.md) / [docs/related-issues.md](docs/related-issues.md)

## English Summary

An unofficial Microsoft Edge extension to toggle Full HD and Intel-targeted 4K playback requests on Disney+.
Intel integrated GPUs support 4K HDR under tested conditions (verified on Iris Xe for ~5 minutes), while NVIDIA and AMD dGPUs are limited to 1080p SDR in this extension's guidance.
AMD systems may experience OS freezes or BSODs with 4K/HDR; software timers cannot prevent hardware or driver hangs.
This extension does not bypass DRM, extract keys, or download streams; a legitimate subscription and supported hardware configuration are required.
