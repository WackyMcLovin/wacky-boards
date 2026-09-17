/* DON HUNT - turn whatever someone pasted into a picture cell into a real, displayable image link.
   Shared by the boards and the Picture Link Maker page. */
(function () {
  function param(u, name) { try { return new URL(u).searchParams.get(name) || ''; } catch (e) { return ''; } }

  // Returns { url, kind } where kind is: 'image' | 'drive' | 'cert' | 'page' | 'empty' | 'text'
  function fixImageLink(raw) {
    let v = String(raw || '').trim().replace(/^["'<(]+|[">)]+$/g, '');
    if (!v) return { url: '', kind: 'empty' };

    // PSA cert numbers / cert pages (handled by the PSA helper)
    let m = v.match(/psacard\.com\/cert\/(\d{6,10})/i) || v.match(/^(?:psa\s*#?\s*)?(\d{6,10})$/i);
    if (m) return { url: '', kind: 'cert', cert: m[1] };

    if (/^\/\//.test(v)) v = 'https:' + v;
    if (/^www\./i.test(v)) v = 'https://' + v;
    if (!/^(https?:|data:image\/)/i.test(v)) return { url: '', kind: 'text' };
    if (/^data:image\//i.test(v)) return { url: v, kind: 'image' };

    // Search-engine wrapper links -> the real image
    if (/google\.[a-z.]+\/(imgres|url)/i.test(v)) {
      const inner = param(v, 'imgurl') || param(v, 'url') || param(v, 'q');
      if (inner) return fixImageLink(inner);
    }
    if (/bing\.com\/images/i.test(v) && param(v, 'mediaurl')) return fixImageLink(param(v, 'mediaurl'));
    if (/duckduckgo\.com/i.test(v) && param(v, 'u')) return fixImageLink(param(v, 'u'));

    // Google Drive / Docs share links
    m = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([\w-]{10,})/) ||
        v.match(/docs\.google\.com\/[^?]*\/d\/([\w-]{10,})/);
    if (m) return { url: 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1600', kind: 'drive' };

    // Dropbox share links
    if (/dropbox\.com\//i.test(v)) {
      try { const u = new URL(v); u.searchParams.delete('dl'); u.searchParams.set('raw', '1'); return { url: u.href, kind: 'image' }; } catch (e) {}
    }

    // imgur page -> direct file
    m = v.match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]{5,8})$/);
    if (m) return { url: 'https://i.imgur.com/' + m[1] + '.jpg', kind: 'image' };

    // eBay photos: use the sharpest size
    if (/i\.ebayimg\.com\/images\//i.test(v)) return { url: v.replace(/s-l\d+(\.\w+)/, 's-l1600$1'), kind: 'image' };

    // Obvious web pages (listings, product pages, search results) are not pictures
    const pageHosts = /(ebay\.com\/itm|tcgplayer\.com\/product|amazon\.[a-z.]+\/(dp|gp)|pricecharting\.com\/game|psacard\.com\/|google\.[a-z.]+\/search|facebook\.com|instagram\.com\/p\/|tiktok\.com|whatnot\.com)/i;
    const imgExt = /\.(jpe?g|png|webp|gif|avif|bmp)(\?|#|$)/i;
    if (pageHosts.test(v) && !imgExt.test(v)) return { url: '', kind: 'page', page: v };

    return { url: v, kind: 'image' };
  }

  // Load test that matches how the board shows pictures.
  function testImage(url, ms) {
    return new Promise(resolve => {
      if (!url) return resolve({ ok: false });
      const im = new Image();
      im.referrerPolicy = 'no-referrer';
      const t = setTimeout(() => { im.src = ''; resolve({ ok: false, timeout: true }); }, ms || 12000);
      im.onload = () => { clearTimeout(t); resolve({ ok: im.naturalWidth > 0, w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = () => { clearTimeout(t); resolve({ ok: false }); };
      im.src = url;
    });
  }

  // Pull an image address out of a drag-and-drop or paste.
  function linkFromTransfer(dt) {
    if (!dt) return '';
    const html = dt.getData && dt.getData('text/html');
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const img = doc.querySelector('img');
      if (img) {
        const set = img.getAttribute('srcset');
        if (set) {   // biggest candidate from srcset
          const best = set.split(',').map(s => s.trim().split(/\s+/)).map(([u, w]) => ({ u, w: parseFloat(w) || 0 })).sort((a, b) => b.w - a.w)[0];
          if (best && /^https?:/i.test(best.u)) return best.u;
        }
        const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
        if (/^(https?:|data:image)/i.test(src)) return src;
      }
    }
    const uri = dt.getData && (dt.getData('text/uri-list') || '').split('\n').find(l => l && !l.startsWith('#'));
    if (uri) return uri.trim();
    return ((dt.getData && dt.getData('text/plain')) || '').trim();
  }

  window.DonHuntImages = { fixImageLink, testImage, linkFromTransfer };
})();
