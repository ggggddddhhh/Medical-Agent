export function isNegated(text, conceptPattern) {
  const normalized = text.replaceAll("是不是", "是否");
  return new RegExp(
    `(?:没有|并无|无明显|无|不是|并非|否认|不伴).{0,8}(?:${conceptPattern})`,
  ).test(normalized);
}
