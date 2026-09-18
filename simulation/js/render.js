/*
 * render.js - side view of the robot on a canvas.
 *
 * The camera follows the robot but the ground texture does not, so wheel travel
 * is visible as the floor sliding past. Without that the robot looks like it is
 * holding station even when it is quietly driving across the room, which is the
 * failure mode you most want to be able to see.
 */

(function (global) {
  'use strict';

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pxPerM = 620;     /* the robot is about 20 cm tall */
  }

  Renderer.prototype.draw = function (robots, slopeRad) {
    var c = this.canvas;
    var ctx = this.ctx;
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth, h = c.clientHeight;

    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var styles = getComputedStyle(document.body);
    var groundColour = styles.getPropertyValue('--grid').trim() || '#ddd';
    var textColour = styles.getPropertyValue('--muted').trim() || '#666';

    var scale = this.pxPerM;
    var groundY = h - 46;
    var centreX = w / 2;

    /* Camera follows the first robot. */
    var camX = robots.length ? robots[0].plant.x : 0;

    /* Ground, with marks every 10 cm so travel is legible. */
    ctx.save();
    ctx.translate(centreX, groundY);
    ctx.rotate(-slopeRad);

    ctx.strokeStyle = groundColour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(w, 0);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.fillStyle = textColour;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';

    var spacing = 0.1;
    var first = Math.floor((camX - (w / 2) / scale) / spacing) * spacing;
    for (var m = first; m < camX + (w / 2) / scale + spacing; m += spacing) {
      var px = (m - camX) * scale;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, 8);
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      if (Math.abs(m % 0.5) < 1e-6 || Math.abs(Math.abs(m % 0.5) - 0.5) < 1e-6) {
        ctx.fillText(m.toFixed(1), px, 20);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    /* Each robot. */
    for (var i = 0; i < robots.length; i++) {
      drawRobot(ctx, robots[i], camX, centreX, groundY, scale, slopeRad, i > 0);
    }
  };

  function drawRobot(ctx, robot, camX, centreX, groundY, scale, slopeRad, ghost) {
    var p = robot.plant;
    var rWheel = p.r;
    var axleX = centreX + (p.x - camX) * scale;
    var axleY = groundY - rWheel * scale;

    ctx.save();
    ctx.globalAlpha = ghost ? 0.55 : 1.0;
    ctx.translate(axleX, axleY);

    /* Wheel. */
    ctx.strokeStyle = robot.colour;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, rWheel * scale, 0, Math.PI * 2);
    ctx.stroke();

    /* A spoke, so wheel rotation is visible. */
    var spin = p.x / rWheel;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(spin) * rWheel * scale * 0.85,
               Math.sin(spin) * rWheel * scale * 0.85);
    ctx.stroke();

    /* Body: a tapered chassis leaning by theta, with the centre of mass marked
     * at its real height so the model is visible rather than decorative. */
    ctx.rotate(-p.theta);

    var bodyH = p.l * 2.0 * scale;
    var bodyW = 0.075 * scale;

    ctx.fillStyle = robot.colour;
    ctx.globalAlpha = ghost ? 0.18 : 0.14;
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, 0);
    ctx.lineTo(bodyW / 2, 0);
    ctx.lineTo(bodyW / 2 * 0.8, -bodyH);
    ctx.lineTo(-bodyW / 2 * 0.8, -bodyH);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = ghost ? 0.55 : 1.0;
    ctx.strokeStyle = robot.colour;
    ctx.lineWidth = 2;
    ctx.stroke();

    /* Centre of mass. */
    ctx.fillStyle = robot.colour;
    ctx.beginPath();
    ctx.arc(0, -p.l * scale, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  global.Renderer = Renderer;

})(typeof window !== 'undefined' ? window : globalThis);
