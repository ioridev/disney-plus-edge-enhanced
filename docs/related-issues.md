# 関連報告・修正情報

参照確認日: **2026-09-08**。保護再生経路を調べるための手掛かりであり、以下の報告がDisney+ Edge Enhancedの実験で発生したフリーズと同一原因だと確認したものではありません。今後、リンク先の公開範囲・修正状態が変わる可能性があります。

この文書追加に伴う新しい再生実験・ドライバー導入は行っていません。プロジェクト自身の実再生結果は[診断記録](diagnostics.md)を参照してください。

## Chromium issue 544339013 — 出力色深度とPlayReady

[Chromium issue 544339013](https://issues.chromium.org/issues/544339013)

- **共有された調査の内容:** 過去の公開検索タイトルは、Netflix / PlayReady SL3000でclear（非暗号化）からencrypted（暗号化）映像へ切り替わる際、出力色深度が8 bpcを超えると無映像になる、という報告として紹介されていました。
- **出典の限界:** 10/12 bpcで再現し8 bpcでは再現しない、という詳細は、調査者から共有されたGPT Proの調査による二次情報です。原典本文から独立に検証できていません。今回の直接アクセスでも取得できたのは **Sign inのみ**です。
- **未確認:** 原典全文、再現条件の全体、最新のステータス、修正コミット、修正済みのブラウザー/OS/ドライバー版。原典全文を確認済みとは扱いません。
- **今回との関係:** 出力色深度は調査候補ですが、紹介された症状は「無映像」であり、今回の「PC全体のフリーズ」と同じ故障とは限りません。こちらの実験ではRGB 8 bpc / HDR ONでもフリーズしたため、8 bpcを回避策・安全条件として推奨する根拠はありません。

ここでのbpcはディスプレイへの**出力色深度**です。HEVC Main 10など、映像ストリーム側のビット深度とは区別します。

## AMD Software 26.9.1 — 修正一覧にPlayReady記載なし

[AMD Software: Adrenalin Edition 26.9.1 Optional Driver Release Notes](https://www.amd.com/en/resources/support-articles/release-notes/RN-RAD-WIN-26-9-1.html)

- **公式ページで確認:** 2026-09-03更新の26.9.1リリースノート。公開されたFixed Issues / Known IssuesにPlayReadyの記載は確認できませんでした。
- **意味する範囲:** 公開修正一覧に明記されていない、という事実のみです。**未修正の証明でも、修正済みの証明でもありません。**
- **プロジェクトの検証状況:** 共有された実験記録では26.9.1は未導入・未検証です。この版での改善・再現を確認したとは記載しません。

## Microsoft Q&A — 2025年のRX 9070 XTフリーズ報告

[Comment réinstaller ou réparer PlayReady sur Windows 11 Pro](https://learn.microsoft.com/fr-ca/answers/questions/5570496/comment-r-installer-ou-r-parer-playready-sur-windo)

- **投稿本文で確認:** 2025-09-30、RX 9070 XT / Windows 11 Pro 24H2の利用者による報告です。EdgeでCanal+ / Netflixを利用するとフリーズやクラッシュが起き、PlayReadyを無効にすると収まると述べています。これは投稿者の観測であって、メーカーによる原因確定ではありません。
- **受理回答の位置付け:** 回答者は独立アドバイザーです。内容は当時のWindows更新に伴う問題として修正を待つ案内ですが、Microsoftの公式不具合認定や修正済みバージョンを示す根拠としては扱いません。
- **未確認:** 今回取得した内容から、この投稿の症状がどの版で解決したかは確認できません。回答が受理されていることを、修正済み・再生復旧済みの証拠にはしません。

## Windows 25H2 resolved issues — 別のDRM修正との区別

[Resolved issues in Windows 11, version 25H2](https://learn.microsoft.com/en-us/windows/release-health/resolved-issues-windows-11-25h2)の、2025年9月のBlu-ray/DVD/Digital TV保護コンテンツ再生問題の項目です。

- **公式ページで確認:** Enhanced Video RendererとHDCP enforcementを使う一部アプリの問題は **KB5065789**、デジタル音声DRMを使うアプリ向けの追加改善は **KB5067036** および後続更新で解消したと説明されています。
- **対象の境界:** Microsoftは、この項目の問題は**ストリーミングサービスには影響しない**と明記しています。
- **今回との関係:** これらの更新が、上記Q&Aのストリーミング症状や本プロジェクトのDisney+ / PlayReadyフリーズを修正したとは言えません。「2025年のDRM修正」という共通点だけで同じバグと結び付けないでください。

## 現時点で言えること

GPU・ドライバー・Windows・保護出力経路を切り分ける手掛かりはありますが、原因や修正版は特定できていません。AMD全体の不具合、NVIDIAなら再生可能、8 bpcなら安全、既存のWindows更新で修正済み、といった一般化は行いません。
