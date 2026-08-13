# Tower / Stack Lab — THIRD_PARTY_NOTICES

Required notices for **runtime third-party code** that still ships.
Donor **media was removed** from the shipping tree and is **not** licensed here.

Working title: Stack Lab (development only). Internal id: `tower`.

---

## Tower gameplay / mechanics (donor JavaScript)

License: **MIT**

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

Source: https://github.com/iamkun/tower_game/blob/c6fa84afe179b661fa71cf7cc8788d0c47ca2875/LICENSE
Local copy: `donor/LICENSE`

Lantern modifications (adapter, asset path, font, audio, chrome removal) remain subject to this notice for the retained donor code portions.

---

## cooljs

License: **ISC** (from source file header; no LICENSE file in cooljs repo)

```
Copyright (c) 2016, chenhongwei836
Copyright (c) 2018, iamkun

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

Bundled inside `donor/dist/main.js`. Upstream: https://github.com/iamkun/cooljs

---

## Zepto 1.1.6

License: **MIT**

```
Copyright (c) 2010-2014 Thomas Fuchs
http://zeptojs.com/

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
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

Local copy: `vendor/zepto-1.1.6.min.js`

---

## Intentionally not included (removed from product)

- **Caketown** (Matthew Pablo, CC-BY-SA 3.0) — `bgm.mp3` deleted from shipping tree; not used at runtime.
- Donor SFX MP3s — deleted; replaced by original Web Audio in `lantern-sfx.js`.
- Donor PNG/GIF/ICO artwork and BMQB / 贝米钱包 logos — deleted.
- wenxue font — never shipped; Arial stack used.
- Google Analytics — donor HTML deleted; not loaded.

Those removals are documented in `GAME_PROVENANCE.md`. This notices file does **not** grant rights in the deleted media.
