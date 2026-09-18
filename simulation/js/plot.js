/*
 * plot.js - a small scrolling time-series plotter on a 2D canvas.
 *
 * Deliberately not a charting library. Everything drawn here is a line against
 * time with a shared window, and writing the fifty lines is cheaper than
 * pulling in a dependency the page would then have to load from a CDN.
 */

(function (global) {
  'use strict';

  function TimePlot(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.title = opts.title || '';
    this.unit = opts.unit || '';
    this.windowS = opts.windowS || 10;
    this.fixedMin = (opts.min !== undefined) ? opts.min : null;
    this.fixedMax = (opts.max !== undefined) ? opts.max : null;
    this.minSpan = opts.minSpan || 1;
    this.series = [];
    this.t = [];
    this.maxPoints = opts.maxPoints || 1200;
  }

  TimePlot.prototype.setSeries = function (defs) {
    this.series = defs.map(function (d) {
      return { key: d.key, label: d.label, colour: d.colour, dash: d.dash || null, data: [] };
    });
    this.t = [];
  };

  TimePlot.prototype.clear = function () {
    this.t = [];
    this.series.forEach(function (s) { s.data = []; });
  };

  TimePlot.prototype.push = function (t, values) {
    this.t.push(t);
    for (var i = 0; i < this.series.length; i++) {
      var v = values[this.series[i].key];
      this.series[i].data.push(v === undefined ? NaN : v);
    }
    if (this.t.length > this.maxPoints) {
      this.t.shift();
      this.series.forEach(function (s) { s.data.shift(); });
    }
  };

  TimePlot.prototype.draw = function () {
    var c = this.canvas;
    var ctx = this.ctx;

    /* Match the backing store to the CSS size so lines stay crisp on a
     * high-DPI screen and the plot is not blurry. */
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth;
    var h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var padL = 44, padR = 8, padT = 20, padB = 18;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    if (plotW <= 0 || plotH <= 0) return;

    var n = this.t.length;
    var tEnd = n ? this.t[n - 1] : 0;
    var tStart = tEnd - this.windowS;

    /* Vertical range. */
    var lo, hi;
    if (this.fixedMin !== null && this.fixedMax !== null) {
      lo = this.fixedMin; hi = this.fixedMax;
    } else {
      lo = Infinity; hi = -Infinity;
      for (var s = 0; s < this.series.length; s++) {
        var d = this.series[s].data;
        for (var i = 0; i < n; i++) {
          if (this.t[i] < tStart) continue;
          var v = d[i];
          if (!isFinite(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (!isFinite(lo)) { lo = -1; hi = 1; }
      var span = hi - lo;
      if (span < this.minSpan) {
        var mid = (hi + lo) / 2;
        lo = mid - this.minSpan / 2;
        hi = mid + this.minSpan / 2;
      } else {
        lo -= span * 0.1; hi += span * 0.1;
      }
    }

    var styles = getComputedStyle(document.body);
    var gridColour = styles.getPropertyValue('--grid').trim() || '#e2e2e2';
    var textColour = styles.getPropertyValue('--muted').trim() || '#666';

    function X(t) { return padL + (t - tStart) / (tEnd - tStart || 1) * plotW; }
    function Y(v) { return padT + (hi - v) / (hi - lo || 1) * plotH; }

    /* Grid and axis labels. */
    ctx.strokeStyle = gridColour;
    ctx.fillStyle = textColour;
    ctx.lineWidth = 1;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (var g = 0; g <= 4; g++) {
      var val = lo + (hi - lo) * g / 4;
      var y = Math.round(Y(val)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(formatTick(val), padL - 6, y);
    }

    /* Zero line, drawn stronger because it is the one that matters. */
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = textColour;
      ctx.globalAlpha = 0.35;
      var yz = Math.round(Y(0)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, yz);
      ctx.lineTo(padL + plotW, yz);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* Title. */
    ctx.textAlign = 'left';
    ctx.fillStyle = textColour;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(this.title + (this.unit ? '  (' + this.unit + ')' : ''), padL, 10);

    /* Traces. */
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    for (var si = 0; si < this.series.length; si++) {
      var ser = this.series[si];
      ctx.strokeStyle = ser.colour;
      ctx.lineWidth = ser.dash ? 1.2 : 1.6;
      ctx.setLineDash(ser.dash || []);
      ctx.beginPath();
      var started = false;
      for (var k = 0; k < n; k++) {
        if (this.t[k] < tStart) continue;
        var vv = ser.data[k];
        if (!isFinite(vv)) { started = false; continue; }
        var px = X(this.t[k]), py = Y(vv);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    /* Legend along the top right. */
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    var lx = padL + plotW;
    for (var li = this.series.length - 1; li >= 0; li--) {
      var l = this.series[li];
      var tw = ctx.measureText(l.label).width;
      ctx.fillStyle = l.colour;
      ctx.fillText(l.label, lx, 10);
      lx -= tw + 14;
      ctx.fillRect(lx + 4, 7, 8, 2);
      lx -= 4;
    }
  };

  function formatTick(v) {
    var a = Math.abs(v);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }

  global.TimePlot = TimePlot;

})(typeof window !== 'undefined' ? window : globalThis);
