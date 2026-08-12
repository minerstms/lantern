/**
 * Prompt #119 — Lantern Power Scroller (canonical management list).
 * Vanilla shared renderer: search, filters, sortable headers, one expanded row.
 * Does not own authorization or hide/restore semantics — callers supply actions.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cmpStr(a, b) {
    return String(a || '')
      .toLowerCase()
      .localeCompare(String(b || '').toLowerCase(), undefined, { sensitivity: 'base' });
  }

  function cmpNum(a, b) {
    var na = Number(a);
    var nb = Number(b);
    if (!isFinite(na)) na = 0;
    if (!isFinite(nb)) nb = 0;
    return na - nb;
  }

  /**
   * @param {object[]} items
   * @param {{ key: string, dir: 'asc'|'desc' }} sort
   * @param {function(object, string): *} getSortValue
   */
  function sortItems(items, sort, getSortValue) {
    var key = sort && sort.key ? sort.key : '';
    var dir = sort && sort.dir === 'asc' ? 'asc' : 'desc';
    var out = (items || []).slice();
    out.sort(function (a, b) {
      var va = getSortValue(a, key);
      var vb = getSortValue(b, key);
      var c;
      if (typeof va === 'number' || typeof vb === 'number') c = cmpNum(va, vb);
      else c = cmpStr(va, vb);
      if (c === 0) c = cmpStr(a && a.id, b && b.id);
      return dir === 'asc' ? c : -c;
    });
    return out;
  }

  /**
   * @param {object[]} items
   * @param {string} query
   * @param {function(object): string} getSearchText
   * @param {Record<string, string>} filterValues filterId → selected value ('' / 'all' = no filter)
   * @param {function(object, string, string): boolean} matchFilter (item, filterId, value)
   */
  function filterItems(items, query, getSearchText, filterValues, matchFilter) {
    var q = String(query || '')
      .trim()
      .toLowerCase();
    var filters = filterValues || {};
    return (items || []).filter(function (item) {
      for (var fid in filters) {
        if (!Object.prototype.hasOwnProperty.call(filters, fid)) continue;
        var fv = filters[fid];
        if (fv == null || fv === '' || fv === 'all') continue;
        if (!matchFilter(item, fid, fv)) return false;
      }
      if (!q) return true;
      return getSearchText(item).toLowerCase().indexOf(q) !== -1;
    });
  }

  function sortIndicator(activeKey, sort) {
    if (!sort || sort.key !== activeKey) return '';
    return sort.dir === 'asc' ? '▲' : '▼';
  }

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mount
   * @param {string} [opts.className]
   * @param {Array<{key:string,label:string,sortable?:boolean}>} opts.columns
   * @param {{key:string,dir:'asc'|'desc'}} opts.defaultSort
   * @param {Array<{id:string,label:string,options:Array<{value:string,label:string}>}>} [opts.filters]
   * @param {string} [opts.searchPlaceholder]
   * @param {string} [opts.emptyMessage]
   * @param {function(object): string} opts.getRowId
   * @param {function(object, string): string|number} opts.getSortValue
   * @param {function(object): string} opts.getSearchText
   * @param {function(object, string, string): boolean} opts.matchFilter
   * @param {function(object, string): string} opts.getCellHtml  returns safe HTML for cell
   * @param {function(object): {label:string, tone?:string}} [opts.getStatus]
   * @param {function(object, HTMLElement): void} opts.renderExpanded
   */
  function create(opts) {
    opts = opts || {};
    var mount = opts.mount;
    if (!mount) throw new Error('LanternPowerList.create: mount required');

    var state = {
      items: [],
      query: '',
      filterValues: {},
      sort: {
        key: (opts.defaultSort && opts.defaultSort.key) || (opts.columns && opts.columns[0] && opts.columns[0].key) || 'id',
        dir: (opts.defaultSort && opts.defaultSort.dir) === 'asc' ? 'asc' : 'desc',
      },
      expandedId: null,
    };

    (opts.filters || []).forEach(function (f) {
      var def =
        f.defaultValue != null
          ? f.defaultValue
          : f.options && f.options.length
            ? f.options[0].value
            : 'all';
      state.filterValues[f.id] = def;
    });

    var root = document.createElement('div');
    root.className = 'lanternPowerList' + (opts.className ? ' ' + opts.className : '');

    var toolbar = document.createElement('div');
    toolbar.className = 'lanternPowerListToolbar';

    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'lanternPowerListSearch';
    search.placeholder = opts.searchPlaceholder || 'Search…';
    search.setAttribute('aria-label', opts.searchPlaceholder || 'Search');
    search.autocomplete = 'off';
    toolbar.appendChild(search);

    var filtersWrap = document.createElement('div');
    filtersWrap.className = 'lanternPowerListFilters';
    var filterSelects = {};
    (opts.filters || []).forEach(function (f) {
      var sel = document.createElement('select');
      sel.className = 'lanternPowerListFilter';
      sel.setAttribute('aria-label', f.label || f.id);
      (f.options || []).forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      });
      sel.value = state.filterValues[f.id];
      sel.addEventListener('change', function () {
        state.filterValues[f.id] = sel.value;
        state.expandedId = null;
        renderBody();
      });
      filterSelects[f.id] = sel;
      filtersWrap.appendChild(sel);
    });
    toolbar.appendChild(filtersWrap);

    // Prompt #121 — optional toolbar actions (Refresh / Add / etc.) without forking the component.
    if (typeof opts.renderToolbarExtra === 'function') {
      opts.renderToolbarExtra(toolbar);
    }

    var meta = document.createElement('div');
    meta.className = 'lanternPowerListMeta';
    meta.setAttribute('aria-live', 'polite');
    toolbar.appendChild(meta);

    var colHd = document.createElement('div');
    colHd.className = 'lanternPowerListColHd';
    colHd.setAttribute('role', 'row');

    var chevHd = document.createElement('span');
    chevHd.setAttribute('aria-hidden', 'true');
    colHd.appendChild(chevHd);

    (opts.columns || []).forEach(function (col) {
      if (col.sortable) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lanternPowerListColHdBtn';
        btn.setAttribute('data-sort-key', col.key);
        btn.innerHTML =
          '<span>' +
          esc(col.label) +
          '</span><span class="lanternPowerListSortMark" data-sort-mark="' +
          esc(col.key) +
          '"></span>';
        btn.addEventListener('click', function () {
          if (state.sort.key === col.key) {
            state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
          } else {
            state.sort.key = col.key;
            state.sort.dir = col.key === 'date' ? 'desc' : 'asc';
          }
          renderBody();
        });
        colHd.appendChild(btn);
      } else {
        var span = document.createElement('span');
        span.textContent = col.label;
        colHd.appendChild(span);
      }
    });

    var body = document.createElement('div');
    body.className = 'lanternPowerListBody';
    body.setAttribute('role', 'list');

    root.appendChild(toolbar);
    root.appendChild(colHd);
    root.appendChild(body);
    mount.innerHTML = '';
    mount.appendChild(root);

    search.addEventListener('input', function () {
      state.query = search.value;
      state.expandedId = null;
      renderBody();
    });

    function visibleItems() {
      var filtered = filterItems(
        state.items,
        state.query,
        opts.getSearchText,
        state.filterValues,
        opts.matchFilter
      );
      return sortItems(filtered, state.sort, opts.getSortValue);
    }

    function updateSortMarks() {
      Array.prototype.forEach.call(colHd.querySelectorAll('[data-sort-mark]'), function (el) {
        var k = el.getAttribute('data-sort-mark');
        el.textContent = sortIndicator(k, state.sort);
      });
    }

    function renderBody() {
      updateSortMarks();
      var rows = visibleItems();
      meta.textContent = rows.length + (rows.length === 1 ? ' item' : ' items');
      body.innerHTML = '';
      if (!rows.length) {
        var empty = document.createElement('div');
        empty.className = 'lanternPowerListEmpty';
        empty.textContent = opts.emptyMessage || 'No items match.';
        body.appendChild(empty);
        return;
      }
      rows.forEach(function (item) {
        var id = String(opts.getRowId(item));
        var det = document.createElement('details');
        det.className = 'lanternPowerListRow';
        det.setAttribute('data-row-id', id);
        det.setAttribute('role', 'listitem');
        if (state.expandedId === id) det.open = true;

        var sum = document.createElement('summary');
        sum.className = 'lanternPowerListRowHd';

        var chev = document.createElement('span');
        chev.className = 'lanternPowerListChev';
        chev.setAttribute('aria-hidden', 'true');
        sum.appendChild(chev);

        (opts.columns || []).forEach(function (col) {
          var cell = document.createElement('span');
          cell.className = 'lanternPowerListCell lanternPowerListCell--' + col.key;
          if (col.key === 'status' && typeof opts.getStatus === 'function') {
            var st = opts.getStatus(item) || { label: '', tone: '' };
            var pill = document.createElement('span');
            pill.className =
              'lanternPowerListStatus' +
              (st.tone ? ' lanternPowerListStatus--' + st.tone : '');
            pill.textContent = st.label || '';
            cell.appendChild(pill);
          } else {
            cell.innerHTML = opts.getCellHtml(item, col.key);
          }
          sum.appendChild(cell);
        });

        var detail = document.createElement('div');
        detail.className = 'lanternPowerListDetail';

        det.appendChild(sum);
        det.appendChild(detail);

        det.addEventListener('toggle', function () {
          if (det.open) {
            state.expandedId = id;
            Array.prototype.forEach.call(body.querySelectorAll('details.lanternPowerListRow[open]'), function (other) {
              if (other !== det) other.open = false;
            });
            detail.innerHTML = '';
            opts.renderExpanded(item, detail);
          } else if (state.expandedId === id) {
            state.expandedId = null;
            detail.innerHTML = '';
          }
        });

        body.appendChild(det);
      });
    }

    return {
      setItems: function (items) {
        state.items = Array.isArray(items) ? items.slice() : [];
        state.expandedId = null;
        renderBody();
      },
      getItems: function () {
        return state.items.slice();
      },
      getVisibleItems: function () {
        return visibleItems();
      },
      getSort: function () {
        return { key: state.sort.key, dir: state.sort.dir };
      },
      setSort: function (key, dir) {
        state.sort.key = key;
        state.sort.dir = dir === 'asc' ? 'asc' : 'desc';
        renderBody();
      },
      getQuery: function () {
        return state.query;
      },
      setQuery: function (q) {
        state.query = String(q || '');
        search.value = state.query;
        renderBody();
      },
      getFilterValues: function () {
        var o = {};
        for (var k in state.filterValues) {
          if (Object.prototype.hasOwnProperty.call(state.filterValues, k)) o[k] = state.filterValues[k];
        }
        return o;
      },
      setFilterValue: function (id, value) {
        state.filterValues[id] = value;
        if (filterSelects[id]) filterSelects[id].value = value;
        renderBody();
      },
      refresh: function () {
        renderBody();
      },
      el: root,
    };
  }

  global.LanternPowerList = {
    create: create,
    sortItems: sortItems,
    filterItems: filterItems,
    sortIndicator: sortIndicator,
    esc: esc,
  };
})(typeof window !== 'undefined' ? window : globalThis);
