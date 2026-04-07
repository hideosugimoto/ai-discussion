// mermaid を動的importで読み込む共通ヘルパー
// - ESMビルドを直接importするのでCDNの仕様変更に左右されない
// - bundle splittingで初回ロードには影響しない（マインドマップ表示時に初めてダウンロード）
// - 1回だけinitializeする

let mermaidPromise = null;

export function loadMermaid() {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "dark" });
      return mermaid;
    })
    .catch((err) => {
      mermaidPromise = null; // 次回リトライ可能にする
      throw new Error(`mermaid.js の読み込みに失敗: ${err.message}`);
    });
  return mermaidPromise;
}
