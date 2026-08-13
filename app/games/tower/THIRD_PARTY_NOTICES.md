# Tower — Third-party notices

This file contains **only** notices that are required or recommended by licenses of code and media **actually present** in the Lantern Tower lab snapshot.

It does **not** invent copyright lines that do not appear in upstream materials.

Do not delete [`LICENSE`](./LICENSE) or [`donor/LICENSE`](./donor/LICENSE). Those files are the upstream MIT grant and must remain with the Software.

Provenance analysis (what to keep vs replace) lives in [`GAME_PROVENANCE.md`](./GAME_PROVENANCE.md).

If Lantern later replaces an item (especially the background music), remove that item’s notice from this file in the same change.

---

## 1. Tower Building Game (donor source)

Required by the MIT license.

- Repository: https://github.com/iamkun/tower_game
- Commit: `c6fa84afe179b661fa71cf7cc8788d0c47ca2875`
- Files: `donor/src/`, `donor/index.html`, `donor/index.js`, `donor/dist/main.js` (Tower portion), and the copies of `LICENSE` in this directory

```
MIT License

Copyright (c) 2018 BMQB, Inc

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. cooljs

Recommended / treated as required by the ISC license for copies of the engine bundled in `donor/dist/main.js`.

- Package: https://www.npmjs.com/package/cooljs
- Repository: https://github.com/iamkun/cooljs
- Declared license: ISC (`package.json` / npm). The cooljs repository and the npm 1.0.2 tarball do **not** contain a LICENSE file.
- Author as stated on npm / `package.json`: iamkun
- No copyright year or legal-entity copyright line is present in those materials. None is added here.

ISC permission notice (OSI ISC License form):

```
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 3. Zepto.js v1.1.6

Required by the MIT license.

- File: `donor/assets/zepto-1.1.6.min.js`
- File header: `/* Zepto v1.1.6 - zepto event ajax form ie - zeptojs.com/license */`
- License page: https://zeptojs.com/license/

```
Copyright (c) 2010-2014 Thomas Fuchs
http://zeptojs.com

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## 4. Background music — “Caketown” (Matthew Pablo)

Required **while** `donor/assets/bgm.mp3` / `donor/assets/bgm.ogg` remain in the tree.

ID3 tags on `bgm.mp3` identify the recording as:

- Title: Caketown
- Artist: Matthew Pablo
- Date: 2012

Public listing: https://opengameart.org/content/caketown-cuteplayful  
License on that listing: **CC-BY-SA 3.0**  
Legal code: http://creativecommons.org/licenses/by-sa/3.0/

The donor repository did not include this attribution. Lantern records it here because ShareAlike / Attribution obligations attach to the track independently of the Tower MIT file.

Lantern’s commercial standard treats CC-BY-SA assets as generally unsuitable unless explicitly approved. **Replace this track before a commercial release.** After replacement, delete this section.

Until replacement, any public distribution that includes the BGM should credit:

> “Caketown” by Matthew Pablo, licensed under CC-BY-SA 3.0  
> https://opengameart.org/content/caketown-cuteplayful

CC-BY-SA 3.0 requires attribution, a license notice, a link to the license, and ShareAlike for adaptations of the licensed work. This file does not reproduce the full CC legal code; the URL above is the license.

---

## 5. Not included here

The following are **not** third-party notice obligations of the current snapshot:

- Google Analytics (removed; not shipped)
- wenxue webfont (never incorporated)
- npm `package-lock.json` / Express / webpack / Babel as shipped source (build-time only; webpack runtime inside `dist/main.js` carries no copyright comment in the minified file)
- Lantern-original wrapper files (`lantern-adapter.js`, `lantern-game-bridge.js`, lab HTML, tests)
- Donor PNG/GIF/SFX for which **no** third-party copyright statement was found (absence of a statement is not a license; see `GAME_PROVENANCE.md`)
