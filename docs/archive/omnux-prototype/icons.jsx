/* omnux — icon set (lucide-style line icons) */
(function () {
  const S = (paths, props = {}) => (extra = {}) =>
    React.createElement('svg', {
      width: extra.size || props.size || 18, height: extra.size || props.size || 18,
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      strokeWidth: extra.sw || props.sw || 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      style: extra.style, className: extra.className,
    }, paths.map((d, i) =>
      d.c === 'circle' ? React.createElement('circle', { key: i, cx: d.cx, cy: d.cy, r: d.r })
      : d.c === 'rect' ? React.createElement('rect', { key: i, x: d.x, y: d.y, width: d.w, height: d.h, rx: d.rx })
      : d.c === 'line' ? React.createElement('line', { key: i, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 })
      : d.c === 'poly' ? React.createElement('polyline', { key: i, points: d.p })
      : React.createElement('path', { key: i, d })
    ));

  const Icons = {
    home: S(['M3 10.5 12 3l9 7.5', 'M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5', 'M9.5 21v-6h5v6']),
    ask: S(['M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 1 1 16.1-3.8z']),
    build: S([{c:'poly',p:'16 18 22 12 16 6'},{c:'poly',p:'8 6 2 12 8 18'}]),
    automate: S([{c:'rect',x:4,y:8,w:16,h:12,rx:3},{c:'line',x1:12,y1:8,x2:12,y2:4},{c:'circle',cx:12,cy:3,r:1.3},{c:'circle',cx:9,cy:14,r:1},{c:'circle',cx:15,cy:14,r:1}]),
    projects: S(['M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']),
    activity: S([{c:'poly',p:'22 12 18 12 15 21 9 3 6 12 2 12'}]),
    settings: S(['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],{sw:1.7}),
    search: S([{c:'circle',cx:11,cy:11,r:7},'m21 21-4.3-4.3']),
    spark: S(['M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.5z'],{sw:1.6}),
    bell: S(['M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9','M13.7 21a2 2 0 0 1-3.4 0']),
    sun: S([{c:'circle',cx:12,cy:12,r:4},{c:'line',x1:12,y1:2,x2:12,y2:4},{c:'line',x1:12,y1:20,x2:12,y2:22},{c:'line',x1:4.2,y1:4.2,x2:5.6,y2:5.6},{c:'line',x1:18.4,y1:18.4,x2:19.8,y2:19.8},{c:'line',x1:2,y1:12,x2:4,y2:12},{c:'line',x1:20,y1:12,x2:22,y2:12},{c:'line',x1:4.2,y1:19.8,x2:5.6,y2:18.4},{c:'line',x1:18.4,y1:5.6,x2:19.8,y2:4.2}]),
    moon: S(['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z']),
    attach: S(['M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49']),
    folder: S(['M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']),
    model: S([{c:'circle',cx:12,cy:12,r:3},{c:'line',x1:12,y1:2,x2:12,y2:6},{c:'line',x1:12,y1:18,x2:12,y2:22},{c:'line',x1:2,y1:12,x2:6,y2:12},{c:'line',x1:18,y1:12,x2:22,y2:12}]),
    send: S(['M22 2 11 13','M22 2 15 22l-4-9-9-4z']),
    arrow: S(['M5 12h14','m13 5 7 7-7 7']),
    arrowR: S(['M9 18l6-6-6-6']),
    chevD: S([{c:'poly',p:'6 9 12 15 18 9'}]),
    chevR: S([{c:'poly',p:'9 6 15 12 9 18'}]),
    msg: S(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']),
    code: S([{c:'poly',p:'16 18 22 12 16 6'},{c:'poly',p:'8 6 2 12 8 18'}]),
    file: S(['M14 3v5h5','M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z']),
    bot: S([{c:'rect',x:4,y:8,w:16,h:12,rx:3},{c:'line',x1:12,y1:8,x2:12,y2:4},{c:'circle',cx:12,cy:3,r:1.3},{c:'circle',cx:9,cy:14,r:1},{c:'circle',cx:15,cy:14,r:1}]),
    scale: S(['M12 3v18','M5 7h14','m5 7-3 6h6z','m19 7-3 6h6z','M7 21h10'],{sw:1.7}),
    check: S([{c:'poly',p:'20 6 9 17 4 12'}]),
    checkCircle: S(['M22 11.5V12a10 10 0 1 1-5.9-9.1',{c:'poly',p:'22 4 12 14.5 9 11.5'}]),
    info: S([{c:'circle',cx:12,cy:12,r:10},{c:'line',x1:12,y1:16,x2:12,y2:12},{c:'line',x1:12,y1:8,x2:12.01,y2:8}]),
    warn: S(['M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z',{c:'line',x1:12,y1:9,x2:12,y2:13},{c:'line',x1:12,y1:17,x2:12.01,y2:17}]),
    x: S([{c:'line',x1:18,y1:6,x2:6,y2:18},{c:'line',x1:6,y1:6,x2:18,y2:18}]),
    plus: S([{c:'line',x1:12,y1:5,x2:12,y2:19},{c:'line',x1:5,y1:12,x2:19,y2:12}]),
    copy: S([{c:'rect',x:9,y:9,w:11,h:11,rx:2},'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1']),
    save: S(['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z',{c:'poly',p:'17 21 17 13 7 13 7 21'},{c:'poly',p:'7 3 7 8 15 8'}]),
    play: S([{c:'poly',p:'5 3 19 12 5 21 5 3'}]),
    refresh: S(['M21 12a9 9 0 1 1-2.6-6.3','M21 3v6h-6']),
    cpu: S([{c:'rect',x:5,y:5,w:14,h:14,rx:2},{c:'rect',x:9,y:9,w:6,h:6},{c:'line',x1:9,y1:2,x2:9,y2:5},{c:'line',x1:15,y1:2,x2:15,y2:5},{c:'line',x1:9,y1:19,x2:9,y2:22},{c:'line',x1:15,y1:19,x2:15,y2:22},{c:'line',x1:2,y1:9,x2:5,y2:9},{c:'line',x1:2,y1:15,x2:5,y2:15},{c:'line',x1:19,y1:9,x2:22,y2:9},{c:'line',x1:19,y1:15,x2:22,y2:15}],{sw:1.7}),
    mem: S([{c:'rect',x:3,y:7,w:18,h:10,rx:2},{c:'line',x1:7,y1:7,x2:7,y2:17},{c:'line',x1:12,y1:7,x2:12,y2:17},{c:'line',x1:17,y1:7,x2:17,y2:17}],{sw:1.7}),
    clock: S([{c:'circle',cx:12,cy:12,r:9},{c:'poly',p:'12 7 12 12 15 14'}]),
    calendar: S([{c:'rect',x:3,y:5,w:18,h:16,rx:2},{c:'line',x1:3,y1:9,x2:21,y2:9},{c:'line',x1:8,y1:3,x2:8,y2:6},{c:'line',x1:16,y1:3,x2:16,y2:6}]),
    telegram: S(['M22 3 2 10.5l6 2.2L18 7l-7 8.5V20l3.2-3.3 4.5 3.3z'],{sw:1.6}),
    shield: S(['M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z',{c:'poly',p:'9 12 11 14 15 10'}]),
    key: S([{c:'circle',cx:7.5,cy:15.5,r:4.5},'m11 12 8-8 3 3','m16 8 2 2']),
    eye: S(['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z',{c:'circle',cx:12,cy:12,r:3}]),
    sliders: S([{c:'line',x1:4,y1:21,x2:4,y2:14},{c:'line',x1:4,y1:10,x2:4,y2:3},{c:'line',x1:12,y1:21,x2:12,y2:12},{c:'line',x1:12,y1:8,x2:12,y2:3},{c:'line',x1:20,y1:21,x2:20,y2:16},{c:'line',x1:20,y1:12,x2:20,y2:3},{c:'line',x1:1,y1:14,x2:7,y2:14},{c:'line',x1:9,y1:8,x2:15,y2:8},{c:'line',x1:17,y1:16,x2:23,y2:16}],{sw:1.7}),
    layers: S([{c:'poly',p:'12 2 2 7 12 12 22 7 12 2'},{c:'poly',p:'2 17 12 22 22 17'},{c:'poly',p:'2 12 12 17 22 12'}]),
    palette: S(['M12 2a10 10 0 1 0 0 20c1.7 0 3-1.3 3-3 0-.8-.3-1.5-.8-2-.5-.6-.8-1.3-.8-2 0-1.7 1.3-3 3-3h2A4.8 4.8 0 0 0 22 8c0-3.3-4.5-6-10-6z',{c:'circle',cx:7.5,cy:11.5,r:1},{c:'circle',cx:12,cy:7.5,r:1},{c:'circle',cx:16.5,cy:11.5,r:1}],{sw:1.7}),
    terminal: S([{c:'poly',p:'4 17 10 11 4 5'},{c:'line',x1:12,y1:19,x2:20,y2:19}]),
    route: S([{c:'circle',cx:6,cy:19,r:3},{c:'circle',cx:18,cy:5,r:3},'M9 19h6a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8']),
    trace: S([{c:'circle',cx:5,cy:6,r:2},{c:'circle',cx:5,cy:18,r:2},{c:'circle',cx:19,cy:12,r:2},'M7 6h6a4 4 0 0 1 0 8H7','M5 8v8']),
    grid: S([{c:'rect',x:3,y:3,w:7,h:7,rx:1.5},{c:'rect',x:14,y:3,w:7,h:7,rx:1.5},{c:'rect',x:14,y:14,w:7,h:7,rx:1.5},{c:'rect',x:3,y:14,w:7,h:7,rx:1.5}]),
    download: S(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',{c:'poly',p:'7 10 12 15 17 10'},{c:'line',x1:12,y1:15,x2:12,y2:3}]),
    git: S([{c:'circle',cx:6,cy:6,r:3},{c:'circle',cx:6,cy:18,r:3},'M6 9v6',{c:'circle',cx:18,cy:8,r:3},'M18 11a9 9 0 0 1-9 9']),
    dots: S([{c:'circle',cx:12,cy:12,r:1},{c:'circle',cx:5,cy:12,r:1},{c:'circle',cx:19,cy:12,r:1}]),
    star: S(['M12 2l2.9 6.3 6.6.6-5 4.4 1.5 6.5L12 16.9 5.9 20.3 7.4 13.8l-5-4.4 6.6-.6z'],{sw:1.6}),
    bulb: S(['M9 18h6','M10 22h4','M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z']),
    doc: S(['M14 3v5h5','M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z',{c:'line',x1:9,y1:13,x2:15,y2:13},{c:'line',x1:9,y1:17,x2:13,y2:17}]),
    fix: S(['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.3-.7-.7-2.3z']),
    lock: S([{c:'rect',x:5,y:11,w:14,h:10,rx:2},'M8 11V7a4 4 0 0 1 8 0v4']),
    logout: S(['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',{c:'poly',p:'16 17 21 12 16 7'},{c:'line',x1:21,y1:12,x2:9,y2:12}]),
  };

  window.Icons = Icons;
})();
