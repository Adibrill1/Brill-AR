# Text-layer fonts

Hebrew fonts for text layers, chosen in the text panel (גופן) and mixed by the cut-letters style (אותיות גזורות).
All are under the SIL Open Font License 1.1: free to use, embed and redistribute, no credit needed in the work; the
licence travels with the files (`OFL/<id>.txt`). Downloaded from Google Fonts by `tools/fetch-fonts.py` (outside this
repository) as WOFF2, each family split the way Google serves it: `-hebrew` (Hebrew letters, niqqud, ₪) and `-latin`
(digits, English, punctuation). `shared.js` registers both under one family name with their unicode ranges, so a page
fetches a file only when a text layer's text needs it.

| id | Hebrew name | Family | Weights | Licence |
|---|---|---|---|---|
| heebo | היבו | Heebo | 400–800 (variable) | `OFL/heebo.txt` |
| rubik | רוביק | Rubik | 400–800 (variable) | `OFL/rubik.txt` |
| frank | פרנק רוהל | Frank Ruhl Libre | 400–900 (variable) | `OFL/frank.txt` |
| david | דוד | David Libre | 400, 700 | `OFL/david.txt` |
| secular | סקולר | Secular One | 400 | `OFL/secular.txt` |
| suez | סואץ | Suez One | 400 | `OFL/suez.txt` |
| karantina | קרנטינה | Karantina | 400, 700 | `OFL/karantina.txt` |
| amatic | אמטיק | Amatic SC | 400, 700 | `OFL/amatic.txt` |
| playpen | פלייפן | Playpen Sans Hebrew | 400–800 (variable) | `OFL/playpen.txt` |
| solitreo | סוליטריאו | Solitreo | 400 | `OFL/solitreo.txt` |
| bellefair | בלפייר | Bellefair | 400 | `OFL/bellefair.txt` |

The cut-letters style draws every letter on its own paper scrap in one of nine of these fonts (all but Playpen, whose
files are the largest, and Solitreo), with a paper and ink pair, size, tilt and edge picked by a random sequence seeded
with the layer id and its shuffle count, so the look is the same everywhere. Papers, inks and shapes are drawn in code.
