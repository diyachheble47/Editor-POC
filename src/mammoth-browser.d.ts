// mammoth ships types for its Node entry only; the browser build has the same API.
// A production build exposes the UMD bundle as the default export (a dev build also as named ones).
declare module 'mammoth/mammoth.browser' {
  interface Mammoth { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> }
  const mammoth: Mammoth
  export default mammoth
  export const extractRawText: Mammoth['extractRawText']
}
