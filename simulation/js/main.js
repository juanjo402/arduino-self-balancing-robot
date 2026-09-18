/*
 * main.js - the application: simulation loop, controls and drawing.
 *
 * The simulation runs on a fixed 1 kHz physics step with the controller at
 * 200 Hz, decoupled from the browser's frame rate. Doing it the other way
 * round, stepping the physics by whatever the last frame took, makes the
 * result depend on the machine it is running on, which for a tuning tool is
 * worse than useless.
 */

(function () {
  'use strict';

  var params = cloneParams(DEFAULT_PARAMS);

  var state = {
    running: true,
    slow: false,
    mode: 'smc',
    robots: [],
    time: 0,
    pushUntil: -1,
    slopeDeg: 0,
    payloadKg: 0.25,
    payloadHeight: 0.18,
    drive: { forward: 0, turn: 0 },
    driveUntil: -1,
    tellModel: false
  };

  var COLOURS = {};
  var renderer, plots;

  /* --------------------------------------------------------------- */
  /* Setup                                                           */
  /* --------------------------------------------------------------- */

  function readColours() {
    var s = getComputedStyle(document.body);
    COLOURS.smc = s.getPropertyValue('--smc').trim() || '#2f6f4f';
    COLOURS.pid = s.getPropertyValue('--pid').trim() || '#a5562b';
    COLOURS.true_ = s.getPropertyValue('--true').trim() || '#000';
    COLOURS.meas = s.getPropertyValue('--meas').trim() || '#bbb';
  }

  function buildRobots() {
    state.robots = [];
    if (state.mode === 'smc' || state.mode === 'both') {
      state.robots.push(new SimRobot(params, 'smc', 'Sliding mode', COLOURS.smc));
    }
    if (state.mode === 'pid' || state.mode === 'both') {
      state.robots.push(new SimRobot(params, 'pid', 'PID', COLOURS.pid));
    }
  }

  function resetSim() {
    state.time = 0;
    state.pushUntil = -1;
    state.driveUntil = -1;
    state.drive.forward = 0;
    state.drive.turn = 0;
    buildRobots();
    var tilt = params.initialTiltDeg || 0;
    state.robots.forEach(function (r) { r.reset(tilt); });
    plots.forEach(function (p) { p.clear(); });
    configurePlots();
  }

  /* --------------------------------------------------------------- */
  /* Slider plumbing                                                 */
  /* --------------------------------------------------------------- */

  var sliderRefs = [];

  function makeSlider(container, spec) {
    var wrap = document.createElement('div');
    wrap.className = 'slider';

    var head = document.createElement('div');
    head.className = 'head';
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = spec.label;
    var val = document.createElement('span');
    val.className = 'val';
    head.appendChild(name);
    head.appendChild(val);

    var input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);

    wrap.appendChild(head);
    wrap.appendChild(input);
    container.appendChild(wrap);

    function current() {
      return spec.get();
    }
    function refresh() {
      var v = current();
      input.value = String(v);
      val.textContent = spec.format ? spec.format(v) : String(v);
    }
    input.addEventListener('input', function () {
      spec.set(parseFloat(input.value));
      val.textContent = spec.format ? spec.format(parseFloat(input.value))
                                    : input.value;
      if (spec.restart) resetSim();
      else applyLive();
      updateGainsOut();
    });

    refresh();
    sliderRefs.push(refresh);
  }

  function group(containerId, specs) {
    var el = document.getElementById(containerId);
    specs.forEach(function (s) { makeSlider(el, s); });
  }

  function f(n) { return function (v) { return v.toFixed(n); }; }
  function sci(v) { return v.toExponential(1); }

  function applyLive() {
    state.robots.forEach(function (r) {
      r.applyGains();
      r.sensors.configure(params.sensors);
      r.kalman.configure(params.kalman);
    });
  }

  /* --------------------------------------------------------------- */
  /* Plots                                                           */
  /* --------------------------------------------------------------- */

  function configurePlots() {
    var tiltSeries = state.robots.map(function (r) {
      return { key: 'tilt_' + r.kind, label: r.label, colour: r.colour };
    });
    plots[0].setSeries(tiltSeries);

    plots[1].setSeries([
      { key: 'accel', label: 'accelerometer', colour: COLOURS.meas },
      { key: 'true', label: 'true angle', colour: COLOURS.true_, dash: [4, 3] },
      { key: 'est', label: 'Kalman estimate', colour: COLOURS.smc }
    ]);

    var ctrlSeries = state.robots.map(function (r) {
      return { key: 'u_' + r.kind, label: r.label + ' accel', colour: r.colour };
    });
    if (state.mode !== 'pid') {
      ctrlSeries.push({ key: 's', label: 'surface s', colour: COLOURS.meas });
    }
    plots[2].setSeries(ctrlSeries);
  }

  /* --------------------------------------------------------------- */
  /* Simulation loop                                                 */
  /* --------------------------------------------------------------- */

  var dtPhys, dtCtrl, substeps, accumulator = 0, lastFrame = 0;

  function disturbances() {
    var d = { torque: 0, baseAccel: 0 };
    if (state.time < state.pushUntil) d.torque = 0.55;
    if (state.slopeDeg !== 0) {
      d.baseAccel = -9.81 * Math.sin(state.slopeDeg * Math.PI / 180);
    }
    return d;
  }

  function stepControl() {
    var dist = disturbances();

    if (state.driveUntil > 0 && state.time > state.driveUntil) {
      state.drive.forward = 0;
      state.driveUntil = -1;
    }

    for (var i = 0; i < state.robots.length; i++) {
      var r = state.robots[i];
      r.controlStep(dtCtrl, state.drive);
      for (var k = 0; k < substeps; k++) r.physicsStep(dtPhys, dist);
    }
    state.time += dtCtrl;

    /* Record. */
    var sample = {};
    state.robots.forEach(function (rb) {
      sample['tilt_' + rb.kind] = rb.plant.theta * 180 / Math.PI;
      sample['u_' + rb.kind] = rb.u;
    });
    var primary = state.robots[0];
    sample['true'] = primary.plant.theta * 180 / Math.PI;
    sample['est'] = primary.estTheta * 180 / Math.PI;
    sample['accel'] = (primary.measuredAngle || 0) * 180 / Math.PI;
    sample['s'] = primary.surface();

    plots[0].push(state.time, sample);
    plots[1].push(state.time, sample);
    plots[2].push(state.time, sample);
  }

  function frame(now) {
    requestAnimationFrame(frame);

    var elapsed = (now - lastFrame) / 1000;
    lastFrame = now;
    if (!isFinite(elapsed) || elapsed <= 0) elapsed = 1 / 60;
    if (elapsed > 0.25) elapsed = 0.25;   /* after a tab switch, do not catch up */

    if (state.running) {
      accumulator += state.slow ? elapsed * 0.2 : elapsed;
      var guard = 0;
      while (accumulator >= dtCtrl && guard < 400) {
        stepControl();
        accumulator -= dtCtrl;
        guard++;
      }
    }

    renderer.draw(state.robots, state.slopeDeg * Math.PI / 180);
    plots.forEach(function (p) { p.draw(); });
    updateReadouts();
  }

  function updateReadouts() {
    var r = state.robots[0];
    if (!r) return;
    var deg = 180 / Math.PI;

    var st = document.getElementById('rState');
    if (r.plant.fallen) {
      st.textContent = 'fallen';
      st.className = 'v status-fallen';
    } else {
      st.textContent = state.running ? 'balancing' : 'paused';
      st.className = 'v';
    }

    document.getElementById('rTilt').textContent =
      (r.plant.theta * deg).toFixed(2) + '°';
    document.getElementById('rErr').textContent =
      ((r.plant.theta - r.estTheta) * deg).toFixed(2) + '°';
    document.getElementById('rSpeed').textContent =
      r.plant.v.toFixed(2) + ' m/s';
    document.getElementById('rPos').textContent =
      r.plant.x.toFixed(2) + ' m';
    document.getElementById('rSurf').textContent =
      (r.kind === 'pid') ? '–' : r.surface().toFixed(3);
  }

  /* --------------------------------------------------------------- */
  /* Controls                                                        */
  /* --------------------------------------------------------------- */

  var MODE_NOTES = {
    smc: 'Sliding mode control. Watch the surface trace on the third plot: it should fall into the boundary layer and stay smooth, not ring across zero.',
    pid: 'A competent cascaded PID, tuned for the same nominal robot. It balances too. The difference shows up when the model stops being right.',
    both: 'Both controllers on identical disturbances and identical sensor noise. Add a payload and watch which one holds its angle.'
  };

  function wireControls() {
    var btnRun = document.getElementById('btnRun');
    btnRun.addEventListener('click', function () {
      state.running = !state.running;
      btnRun.textContent = state.running ? 'Pause' : 'Run';
    });

    document.getElementById('btnReset').addEventListener('click', resetSim);

    var btnSlow = document.getElementById('btnSlow');
    btnSlow.addEventListener('click', function () {
      state.slow = !state.slow;
      btnSlow.setAttribute('aria-pressed', String(state.slow));
      btnSlow.classList.toggle('primary', state.slow);
    });

    var seg = document.getElementById('modeSeg');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.mode = b.dataset.mode;
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      document.getElementById('modeNote').textContent = MODE_NOTES[state.mode];
      resetSim();
    });
    document.getElementById('modeNote').textContent = MODE_NOTES.smc;

    document.getElementById('btnPush').addEventListener('click', shove);
    document.getElementById('btnPayload').addEventListener('click', addPayload);
    document.getElementById('btnDriveFwd').addEventListener('click', function () {
      state.drive.forward = 0.7;
      state.driveUntil = state.time + 3;
    });

    document.getElementById('chkTellModel').addEventListener('change', function (e) {
      state.tellModel = e.target.checked;
    });

    document.getElementById('chkSensors').addEventListener('change', function (e) {
      params.sensors.enabled = e.target.checked;
      applyLive();
    });

    document.getElementById('chkCompensate').addEventListener('change', function (e) {
      params.sensors.compensateAccel = e.target.checked;
    });

    document.getElementById('btnCopy').addEventListener('click', copyGains);
    document.getElementById('btnDefaults').addEventListener('click', function () {
      params = cloneParams(DEFAULT_PARAMS);
      sliderRefs.forEach(function (fn) { fn(); });
      document.getElementById('chkSensors').checked = params.sensors.enabled;
      document.getElementById('chkCompensate').checked = params.sensors.compensateAccel;
      resetSim();
      updateGainsOut();
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); btnRun.click(); }
      else if (e.key === 'r') resetSim();
      else if (e.key === 'p') shove();
      else if (e.key === 'ArrowUp') { state.drive.forward = 1; state.driveUntil = -1; }
      else if (e.key === 'ArrowDown') { state.drive.forward = -1; state.driveUntil = -1; }
      else if (e.key === 'ArrowLeft') state.drive.turn = -1;
      else if (e.key === 'ArrowRight') state.drive.turn = 1;
    });

    document.addEventListener('keyup', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') state.drive.forward = 0;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') state.drive.turn = 0;
    });
  }

  function shove() {
    state.pushUntil = state.time + 0.08;
  }

  function addPayload() {
    state.robots.forEach(function (r) {
      r.plant.addPayload(state.payloadKg, state.payloadHeight);
      if (state.tellModel) r.syncModel();
    });
  }

  function buildSliders() {
    group('distSliders', [
      { label: 'Slope', min: -12, max: 12, step: 0.5, format: function (v) { return v.toFixed(1) + '°'; },
        get: function () { return state.slopeDeg; }, set: function (v) { state.slopeDeg = v; } },
      { label: 'Payload mass', min: 0.05, max: 1.0, step: 0.05, format: function (v) { return (v * 1000).toFixed(0) + ' g'; },
        get: function () { return state.payloadKg; }, set: function (v) { state.payloadKg = v; } },
      { label: 'Payload height', min: 0.05, max: 0.3, step: 0.01, format: function (v) { return (v * 100).toFixed(0) + ' cm'; },
        get: function () { return state.payloadHeight; }, set: function (v) { state.payloadHeight = v; } }
    ]);

    group('sensorSliders', [
      { label: 'Accelerometer noise', min: 0, max: 1.2, step: 0.01, format: function (v) { return v.toFixed(2) + ' m/s²'; },
        get: function () { return params.sensors.accelNoise; }, set: function (v) { params.sensors.accelNoise = v; } },
      { label: 'Gyro noise', min: 0, max: 0.05, step: 0.001, format: function (v) { return (v * 57.3).toFixed(2) + ' °/s'; },
        get: function () { return params.sensors.gyroNoise; }, set: function (v) { params.sensors.gyroNoise = v; } },
      { label: 'Gyro bias drift', min: 0, max: 0.01, step: 0.0005, format: sci,
        get: function () { return params.sensors.gyroBiasDrift; }, set: function (v) { params.sensors.gyroBiasDrift = v; } }
    ]);

    group('smcSliders', [
      { label: 'c_theta, balance', min: 2, max: 20, step: 0.1, format: f(1),
        get: function () { return params.smc.cTheta; }, set: function (v) { params.smc.cTheta = v; } },
      { label: 'c_v, speed', min: 0, max: 2, step: 0.01, format: f(2),
        get: function () { return params.smc.cV; }, set: function (v) { params.smc.cV = v; } },
      { label: 'c_x, position', min: 0, max: 0.6, step: 0.01, format: f(2),
        get: function () { return params.smc.cX; }, set: function (v) { params.smc.cX = v; } },
      { label: 'eta, reaching', min: 0, max: 30, step: 0.5, format: f(1),
        get: function () { return params.smc.eta; }, set: function (v) { params.smc.eta = v; } },
      { label: 'K, switching', min: 0, max: 15, step: 0.1, format: f(1),
        get: function () { return params.smc.K; }, set: function (v) { params.smc.K = v; } },
      { label: 'phi, boundary layer', min: 0.001, max: 0.4, step: 0.001, format: f(3),
        get: function () { return params.smc.phi; }, set: function (v) { params.smc.phi = v; } }
    ]);

    group('pidSliders', [
      { label: 'Kp angle', min: 0, max: 90, step: 0.5, format: f(1),
        get: function () { return params.pid.kpAngle; }, set: function (v) { params.pid.kpAngle = v; } },
      { label: 'Kd angle', min: 0, max: 12, step: 0.1, format: f(1),
        get: function () { return params.pid.kdAngle; }, set: function (v) { params.pid.kdAngle = v; } },
      { label: 'Ki angle', min: 0, max: 150, step: 1, format: f(0),
        get: function () { return params.pid.kiAngle; }, set: function (v) { params.pid.kiAngle = v; } },
      { label: 'Kp speed', min: 0, max: 0.4, step: 0.005, format: f(3),
        get: function () { return params.pid.kpSpeed; }, set: function (v) { params.pid.kpSpeed = v; } },
      { label: 'Ki speed', min: 0, max: 0.4, step: 0.005, format: f(3),
        get: function () { return params.pid.kiSpeed; }, set: function (v) { params.pid.kiSpeed = v; } },
      { label: 'Kp position', min: 0, max: 0.6, step: 0.005, format: f(3),
        get: function () { return params.pid.kpPos; }, set: function (v) { params.pid.kpPos = v; } }
    ]);

    group('kalmanSliders', [
      { label: 'Q angle', min: 0.0001, max: 0.02, step: 0.0001, format: sci,
        get: function () { return params.kalman.qAngle; }, set: function (v) { params.kalman.qAngle = v; } },
      { label: 'Q bias', min: 0.00001, max: 0.02, step: 0.00001, format: sci,
        get: function () { return params.kalman.qBias; }, set: function (v) { params.kalman.qBias = v; } },
      { label: 'R measure', min: 0.001, max: 0.3, step: 0.001, format: f(3),
        get: function () { return params.kalman.rMeasure; }, set: function (v) { params.kalman.rMeasure = v; } }
    ]);

    group('robotSliders', [
      { label: 'Body mass', min: 0.3, max: 2.5, step: 0.05, format: function (v) { return v.toFixed(2) + ' kg'; },
        restart: true,
        get: function () { return params.robot.m; }, set: function (v) { params.robot.m = v; } },
      { label: 'Centre of mass height', min: 0.03, max: 0.3, step: 0.005, format: function (v) { return (v * 100).toFixed(1) + ' cm'; },
        restart: true,
        get: function () { return params.robot.l; }, set: function (v) { params.robot.l = v; } },
      { label: 'Wheel radius', min: 0.02, max: 0.08, step: 0.002, format: function (v) { return (v * 1000).toFixed(0) + ' mm'; },
        restart: true,
        get: function () { return params.robot.r; }, set: function (v) { params.robot.r = v; } },
      { label: 'Start tilt', min: 0, max: 20, step: 0.5, format: function (v) { return v.toFixed(1) + '°'; },
        restart: true,
        get: function () { return params.initialTiltDeg || 0; }, set: function (v) { params.initialTiltDeg = v; } }
    ]);
  }

  function gainsText() {
    var s = params.smc;
    return '/* Found in the simulator. Verify on the robot before trusting them. */\n' +
      '#define SMC_C_THETA       ' + s.cTheta.toFixed(2) + 'f\n' +
      '#define SMC_C_V           ' + s.cV.toFixed(3) + 'f\n' +
      '#define SMC_C_X           ' + s.cX.toFixed(3) + 'f\n' +
      '#define SMC_ETA           ' + s.eta.toFixed(2) + 'f\n' +
      '#define SMC_K             ' + s.K.toFixed(2) + 'f\n' +
      '#define SMC_PHI           ' + s.phi.toFixed(4) + 'f\n' +
      '\n' +
      '#define KALMAN_Q_ANGLE    ' + params.kalman.qAngle + 'f\n' +
      '#define KALMAN_Q_BIAS     ' + params.kalman.qBias + 'f\n' +
      '#define KALMAN_R_MEASURE  ' + params.kalman.rMeasure + 'f';
  }

  function updateGainsOut() {
    document.getElementById('gainsOut').textContent = gainsText();
  }

  function copyGains() {
    var text = gainsText();
    var btn = document.getElementById('btnCopy');
    function done(ok) {
      btn.textContent = ok ? 'Copied' : 'Select the text below';
      setTimeout(function () { btn.textContent = 'Copy for Config.h'; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); },
                                              function () { done(false); });
    } else {
      done(false);
    }
  }

  /* --------------------------------------------------------------- */

  function init() {
    readColours();

    renderer = new Renderer(document.getElementById('stage'));

    plots = [
      new TimePlot(document.getElementById('plotTilt'),
        { title: 'Tilt angle', unit: 'deg', windowS: 12, minSpan: 4 }),
      new TimePlot(document.getElementById('plotEst'),
        { title: 'Angle estimation', unit: 'deg', windowS: 12, minSpan: 4 }),
      new TimePlot(document.getElementById('plotCtrl'),
        { title: 'Control effort', unit: 'm/s² and s', windowS: 12, minSpan: 2 })
    ];

    dtPhys = 1 / params.sim.physicsHz;
    dtCtrl = 1 / params.sim.controlHz;
    substeps = Math.round(params.sim.physicsHz / params.sim.controlHz);

    buildSliders();
    wireControls();
    updateGainsOut();
    resetSim();

    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
