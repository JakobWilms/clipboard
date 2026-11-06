// Heuristic: does this plain text look like terminal / CLI / config output?
// Used to switch new entries to monospace automatically (the user can toggle it per entry).

const PROMPT = new RegExp([
  String.raw`^\s*\*?[AB]:[\w.@-]+(?:>[\w>-]*)?[#$]`,          // Nokia SR OS classic: A:pe1#  *A:admin@pe1>config#
  String.raw`^\s*\[(?:ex|gl|pr|ro)?:?\/[^\]]*\]\s*$`,          // MD-CLI context line: [ex:/configure router "Base"]
  String.raw`^\s*[\w.-]+@[\w.-]+(?::[^\s#$>]*)?\s?[#$>%]`,      // user@host:~# / admin@router>
  String.raw`^\s*[\w.()\/-]+[#>]\s*\S`,                           // router# show ... / switch(config)# ...
  String.raw`^\s*PS [A-Z]:\\[^>]*>`,                              // PowerShell
  String.raw`^\s*[A-Z]:\\[^>]*>`,                                 // cmd.exe
  String.raw`^\s*[$#] \S`,                                        // bare $ / # prompt
].join('|'));

export function looksLikeCliOutput(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim());
  if (!lines.length) return false;
  if (lines.length === 1) return PROMPT.test(lines[0]);

  const count = (pattern) => lines.filter((line) => pattern.test(line)).length;
  let score = 0;
  if (count(PROMPT) >= 1) score += 2;
  if (count(/^(?: {2,}|\t)\S/) >= 2) score += 1;                                    // indented blocks
  if (count(/\S {3,}\S/) >= 2) score += 1;                                           // column-aligned tables
  if (count(/^\s*(?:#|!|\/\/|={3,}|-{3,})/) >= 2) score += 1;                       // comments / separators
  const shell = count(/\$\(|\$\{|\|\s*(?:grep|awk|sed|head|tail|sort|wc|jq)\b|;;|&&|\b(?:echo|export|sudo)\s|;\s*(?:do|then)\s*$|^\s*(?:done|fi|esac)\s*$/);
  if (shell) score += shell >= 2 ? 2 : 1;                                            // shell scripts
  if (count(/[{}]\s*$|^\s*(?:exit(?: all)?|configure|interface|router|service|port|vprn|ies|bgp|isis|ospf)\b/) >= 2) score += 1; // config
  return score >= 2;
}
