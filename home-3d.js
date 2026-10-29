// Three.js scene for the home page
//   #studio-3d : interactive room diorama where visitors try lighting moods and colour palettes
// Loaded as a classic script; Three.js is pulled in with a dynamic import so it also works from file://
(async () => {
    const studioCanvas = document.getElementById('studio-canvas');
    if (!studioCanvas) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let THREE;
    try {
        THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    } catch (err) {
        showFallbacks();
        return;
    }

    const PALETTE = {
        sage: 0x4d513b,
        sageLeaf: 0x7d8560,
        walnut: 0x6b4a35,
        charcoal: 0x221E1D,
    };

    const scenes = [];
    try {
        scenes.push(createStudio(studioCanvas));
    } catch (err) {
        // WebGL unavailable (old device, disabled GPU) - keep the page usable
        showFallbacks();
        return;
    }

    // Single render loop; each scene only renders while it is on screen
    let last = performance.now();
    function loop(now) {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        scenes.forEach(s => {
            if (!s.visible) return;
            s.update(now / 1000, dt);
            s.renderer.render(s.scene, s.camera);
        });
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // ------------------------------------------------------------------
    // Shared helpers
    // ------------------------------------------------------------------
    function makeRenderer(canvas, alpha) {
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        return renderer;
    }

    function watchCanvas(entry, onResize) {
        const { canvas, renderer } = entry;
        const resize = () => {
            const w = canvas.clientWidth, h = canvas.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            onResize(w / h);
        };
        new ResizeObserver(resize).observe(canvas);
        new IntersectionObserver(([e]) => { entry.visible = e.isIntersecting; }, { rootMargin: '100px' }).observe(canvas);
        resize();
    }

    function enableShadows(root) {
        root.traverse(o => {
            if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
        });
    }

    function damp(current, target, lambda, dt) {
        return current + (target - current) * (1 - Math.exp(-lambda * dt));
    }

    function roundedRectShape(w, h, r) {
        const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
        return s;
    }

    // Soft-edged box for upholstery and joinery
    function roundedBox(w, h, d, r) {
        const b = r * 0.5;
        const sw = w - 2 * b, sh = h - 2 * b;
        const shape = roundedRectShape(sw, sh, Math.min(r - b + 0.001, sw / 2, sh / 2));
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 6,
        });
        geo.translate(0, 0, -(d - 2 * b) / 2);
        return geo;
    }

    function vaseGeometry(h, r) {
        const pts = [];
        for (let i = 0; i <= 24; i++) {
            const t = i / 24;
            pts.push(new THREE.Vector2(r * (0.55 + 0.45 * Math.sin(Math.PI * (t * 0.85 + 0.1))), t * h));
        }
        return new THREE.LatheGeometry(pts, 48);
    }

    function mat(color, roughness = 0.9, extra = {}) {
        return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    }

    // ------------------------------------------------------------------
    // Design studio diorama
    // ------------------------------------------------------------------
    function createStudio(canvas) {
        const section = document.getElementById('studio-3d');
        const frame = canvas.parentElement;
        const hint = section.querySelector('.studio-hint');

        const renderer = makeRenderer(canvas, true);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
        camera.position.set(8, 6.4, 9.6);
        camera.lookAt(-0.1, 0.55, -0.2);

        const room = new THREE.Group();
        scene.add(room);

        // --- Lights ---
        const hemi = new THREE.HemisphereLight(0xfffaf4, 0xd6c8b8, 1.7);
        const fill = new THREE.DirectionalLight(0xffffff, 0.9);
        fill.position.set(6, 5, 8);
        const sun = new THREE.DirectionalLight(0xffdcb0, 3.0);
        sun.position.set(4.5, 6, -8);
        sun.target.position.set(0.3, 0, 0.5);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
        sun.shadow.bias = -0.0005;
        sun.shadow.normalBias = 0.02;
        room.add(sun, sun.target);
        scene.add(hemi, fill);

        // --- Shell: plinth, oak floor, two walls ---
        const base = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.35, 6.3), mat(0xd8cbbb));
        base.position.y = -0.255;
        const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 6), mat(0xffffff, 0.75, { map: plankTexture() }));
        floor.position.y = -0.04;
        room.add(base, floor);

        // Colour palettes: walls + one accent (sofa, pendant, rug border, accessories)
        const activePalette = section.querySelector('[data-palette].is-active') || section.querySelector('[data-palette]');
        const [startWall, startAccent] = activePalette.dataset.palette.split(',');
        const wallTarget = new THREE.Color(startWall);
        const accentTarget = new THREE.Color(startAccent);
        const cushionTarget = new THREE.Color();
        const chairTarget = new THREE.Color();
        const wallMat = mat(wallTarget.getHex(), 0.95);
        const accentMat = (roughness = 0.9) => mat(accentTarget.getHex(), roughness);

        // Back wall with an arched window (hole fully inside the outline)
        const backShape = new THREE.Shape();
        backShape.moveTo(-3, 0); backShape.lineTo(3, 0); backShape.lineTo(3, 3.6); backShape.lineTo(-3, 3.6); backShape.closePath();
        const WIN_X = 1.1, WIN_W = 1.3, WIN_BOTTOM = 0.8, WIN_SPRING = 2.0;
        const hole = new THREE.Path();
        hole.moveTo(WIN_X - WIN_W / 2, WIN_BOTTOM);
        hole.lineTo(WIN_X + WIN_W / 2, WIN_BOTTOM);
        hole.lineTo(WIN_X + WIN_W / 2, WIN_SPRING);
        hole.absarc(WIN_X, WIN_SPRING, WIN_W / 2, 0, Math.PI, false);
        hole.lineTo(WIN_X - WIN_W / 2, WIN_BOTTOM);
        backShape.holes.push(hole);
        const backWall = new THREE.Mesh(new THREE.ExtrudeGeometry(backShape, { depth: 0.2, bevelEnabled: false, curveSegments: 32 }), wallMat);
        backWall.position.z = -3;
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 6), wallMat);
        leftWall.position.set(-2.9, 1.8, 0);
        room.add(backWall, leftWall);

        // Window: mullions, sill and the sky beyond
        const frameMat = mat(PALETTE.charcoal, 0.6);
        const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.04, WIN_SPRING + WIN_W / 2 - WIN_BOTTOM, 0.04), frameMat);
        mullionV.position.set(WIN_X, (WIN_BOTTOM + WIN_SPRING + WIN_W / 2) / 2, -2.9);
        const mullionH = new THREE.Mesh(new THREE.BoxGeometry(WIN_W, 0.04, 0.04), frameMat);
        mullionH.position.set(WIN_X, WIN_SPRING, -2.9);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(WIN_W + 0.3, 0.06, 0.3), mat(0xe2d6c6));
        sill.position.set(WIN_X, WIN_BOTTOM - 0.03, -2.72);
        const skyMat = new THREE.MeshBasicMaterial({ color: 0xfff3e0 });
        const sky = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), skyMat);
        sky.position.set(WIN_X, 1.9, -3.5);
        sky.receiveShadow = false;
        room.add(mullionV, mullionH, sill, sky);

        // --- Rug ---
        const rugBorder = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.02, 64), accentMat(1));
        rugBorder.scale.x = 1.25;
        rugBorder.position.set(-0.6, 0.01, -0.9);
        const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.022, 64), mat(0xe6d7c2, 1));
        rug.scale.x = 1.25;
        rug.position.set(-0.6, 0.012, -0.9);
        room.add(rugBorder, rug);

        // --- Sofa against the back wall ---
        const sofaMat = accentMat(0.95);
        const cushionMat = accentMat(0.95);
        const pillowMat = mat(wallTarget.getHex(), 1);
        const sofa = new THREE.Group();
        const sofaBase = new THREE.Mesh(roundedBox(2.4, 0.42, 0.95, 0.08), sofaMat);
        sofaBase.position.y = 0.29;
        const sofaBack = new THREE.Mesh(roundedBox(2.4, 0.62, 0.26, 0.1), sofaMat);
        sofaBack.position.set(0, 0.72, -0.35);
        const armL = new THREE.Mesh(roundedBox(0.24, 0.6, 0.95, 0.1), sofaMat);
        armL.position.set(-1.08, 0.48, 0);
        const armR = armL.clone();
        armR.position.x = 1.08;
        sofa.add(sofaBase, sofaBack, armL, armR);
        [-0.47, 0.47].forEach(x => {
            const seat = new THREE.Mesh(roundedBox(0.92, 0.16, 0.7, 0.07), cushionMat);
            seat.position.set(x, 0.56, 0.08);
            const pillow = new THREE.Mesh(roundedBox(0.42, 0.38, 0.12, 0.06), x < 0 ? mat(0xf1e8dc, 1) : pillowMat);
            pillow.position.set(x * 1.2, 0.8, -0.16);
            pillow.rotation.set(-0.2, 0, x < 0 ? 0.08 : -0.1);
            sofa.add(seat, pillow);
        });
        sofa.position.set(-1.0, 0, -2.32);
        room.add(sofa);

        // --- Round walnut coffee table with a little still-life ---
        const table = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 48), mat(PALETTE.walnut, 0.6));
        top.position.y = 0.42;
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 0.4, 32), mat(PALETTE.walnut, 0.6));
        pedestal.position.y = 0.2;
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xefe6da, 0.7, { side: THREE.DoubleSide }));
        bowl.position.set(-0.15, 0.6, 0.05);
        const tableVase = new THREE.Mesh(vaseGeometry(0.34, 0.09), mat(PALETTE.sage, 0.6, { side: THREE.DoubleSide }));
        tableVase.position.set(0.2, 0.45, -0.1);
        table.add(top, pedestal, bowl, tableVase);
        table.position.set(-1.0, 0, -0.95);
        room.add(table);

        // --- Bouclé lounge chair ---
        const chair = new THREE.Group();
        const boucle = mat(0xf0e8dc, 1);
        const chairSeat = new THREE.Mesh(roundedBox(0.85, 0.28, 0.8, 0.12), boucle);
        chairSeat.position.y = 0.38;
        const chairBack = new THREE.Mesh(roundedBox(0.85, 0.62, 0.2, 0.1), boucle);
        chairBack.position.set(0, 0.72, -0.33);
        chairBack.rotation.x = -0.15;
        chair.add(chairSeat, chairBack);
        [[-0.34, -0.3], [0.34, -0.3], [-0.34, 0.3], [0.34, 0.3]].forEach(([x, z]) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.26, 12), mat(PALETTE.walnut, 0.6));
            leg.position.set(x, 0.13, z);
            chair.add(leg);
        });
        chair.position.set(1.35, 0, -0.55);
        chair.rotation.y = -Math.PI / 2.6;
        room.add(chair);

        // --- Sideboard and artwork on the left wall ---
        const sideboard = new THREE.Mesh(roundedBox(0.45, 0.55, 1.7, 0.05), mat(PALETTE.walnut, 0.6));
        sideboard.position.set(-2.55, 0.3, 0.75);
        const sideVase = new THREE.Mesh(vaseGeometry(0.5, 0.12), mat(0xd9c3ad, 0.8, { side: THREE.DoubleSide }));
        sideVase.position.set(-2.55, 0.575, 1.3);
        const sideOrb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 16), accentMat(0.5));
        sideOrb.position.set(-2.55, 0.685, 0.35);
        room.add(sideboard, sideVase, sideOrb);

        const art = new THREE.Group();
        const artFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.05), mat(PALETTE.walnut, 0.6));
        const canvasPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.86), mat(0xf4ece1, 1));
        canvasPanel.position.z = 0.03;
        const artSun = new THREE.Mesh(new THREE.CircleGeometry(0.2, 48), accentMat(1));
        artSun.position.set(0.22, 0.12, 0.035);
        const artHill = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48, 0, Math.PI), mat(PALETTE.sage, 1));
        artHill.position.set(-0.15, -0.43, 0.036);
        art.add(artFrame, canvasPanel, artSun, artHill);
        art.position.set(-2.77, 1.75, 0.75);
        art.rotation.y = Math.PI / 2;
        room.add(art);

        // --- Olive tree by the window ---
        const plant = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 32), mat(0xe8dccb, 0.9));
        pot.position.y = 0.25;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.2, 8), mat(0x6e5a48));
        trunk.position.y = 1.05;
        plant.add(pot, trunk);
        const leafMat = mat(PALETTE.sageLeaf, 0.9, { flatShading: true });
        [[0, 1.75, 0, 0.36], [0.25, 1.55, 0.1, 0.26], [-0.22, 1.6, -0.08, 0.28], [0.05, 2.05, -0.05, 0.25], [-0.1, 1.4, 0.2, 0.2]]
            .forEach(([x, y, z, r]) => {
                const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
                blob.position.set(x, y, z);
                plant.add(blob);
            });
        plant.position.set(2.35, 0, -2.3);
        room.add(plant);

        // --- Skirting boards ---
        const skirtMat = mat(0xf3ede4, 0.7);
        const skirtBack = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.1, 0.03), skirtMat);
        skirtBack.position.set(0.1, 0.05, -2.785);
        const skirtLeft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 6), skirtMat);
        skirtLeft.position.set(-2.785, 0.05, 0);
        room.add(skirtBack, skirtLeft);

        // --- Dining area (front right): table, four arch-back chairs, centrepiece ---
        const oakMat = mat(0xc9a782, 0.65);
        const dining = new THREE.Group();
        const diningTop = new THREE.Mesh(roundedBox(1.55, 0.05, 0.85, 0.02), oakMat);
        diningTop.position.y = 0.74;
        dining.add(diningTop);
        [[-0.66, -0.32], [0.66, -0.32], [-0.66, 0.32], [0.66, 0.32]].forEach(([x, z]) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.72, 12), oakMat);
            leg.position.set(x, 0.36, z);
            dining.add(leg);
        });
        const diningVase = new THREE.Mesh(vaseGeometry(0.3, 0.09), mat(0xefe6da, 0.6, { side: THREE.DoubleSide }));
        diningVase.position.set(0, 0.765, 0);
        dining.add(diningVase);
        [[-0.25, 0.3], [0.2, -0.3], [0.05, 0.02]].forEach(([tiltX, tiltZ]) => {
            const stem = new THREE.Group();
            const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.5, 5), mat(0x6e5a48));
            twig.position.y = 0.25;
            const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), leafMat);
            leaf.position.y = 0.5;
            stem.add(twig, leaf);
            stem.position.set(0, 0.95, 0);
            stem.rotation.set(tiltX, 0, tiltZ);
            dining.add(stem);
        });
        [[-0.4, 0.22], [0.4, -0.22]].forEach(([x, z]) => {
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.015, 32), mat(0xf7f2ea, 0.4));
            plate.position.set(x, 0.775, z);
            dining.add(plate);
        });

        // Arched chair back, a nod to the White Arch logo
        const chairBackShape = new THREE.Shape();
        chairBackShape.moveTo(-0.2, 0);
        chairBackShape.lineTo(0.2, 0);
        chairBackShape.lineTo(0.2, 0.22);
        chairBackShape.absarc(0, 0.22, 0.2, 0, Math.PI, false);
        chairBackShape.lineTo(-0.2, 0);
        const chairBackGeo = new THREE.ExtrudeGeometry(chairBackShape, { depth: 0.04, bevelEnabled: false, curveSegments: 24 });
        const seatPadMat = mat(0xe9dfd1, 1);
        // Dining chairs are painted to match the walls (a touch deeper so they stand out)
        const chairMat = mat(wallTarget.getHex(), 0.7);
        const makeDiningChair = () => {
            const c = new THREE.Group();
            const seat = new THREE.Mesh(roundedBox(0.44, 0.06, 0.42, 0.02), chairMat);
            seat.position.y = 0.45;
            const pad = new THREE.Mesh(roundedBox(0.4, 0.05, 0.38, 0.025), seatPadMat);
            pad.position.y = 0.5;
            const back = new THREE.Mesh(chairBackGeo, chairMat);
            back.position.set(0, 0.5, -0.23);
            c.add(seat, pad, back);
            [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].forEach(([x, z]) => {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.45, 8), chairMat);
                leg.position.set(x, 0.225, z);
                c.add(leg);
            });
            return c;
        };
        // Chairs face the table: backs on the outside edges
        [[-0.38, -0.62, 0], [0.38, -0.62, 0], [-0.38, 0.62, Math.PI], [0.38, 0.62, Math.PI]].forEach(([x, z, rot]) => {
            const c = makeDiningChair();
            c.position.set(x, 0, z);
            c.rotation.y = rot;
            dining.add(c);
        });
        dining.position.set(1.25, 0, 1.75);
        room.add(dining);

        // --- Shelving unit with closed cabinet below (left wall, front) ---
        const shelf = new THREE.Group();
        const SH_W = 1.25, SH_D = 0.4, SH_H = 2.3, T = 0.04;
        const walnutMat = mat(PALETTE.walnut, 0.6);
        [-SH_W / 2 + T / 2, SH_W / 2 - T / 2].forEach(z => {
            const side = new THREE.Mesh(new THREE.BoxGeometry(SH_D, SH_H, T), walnutMat);
            side.position.set(0, SH_H / 2, z);
            shelf.add(side);
        });
        const cabinet = new THREE.Mesh(new THREE.BoxGeometry(SH_D, 0.8, SH_W - 2 * T), walnutMat);
        cabinet.position.y = 0.4;
        shelf.add(cabinet);
        [-1, 1].forEach(dir => {
            const door = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.72, SH_W / 2 - T - 0.02), mat(0x7a5741, 0.55));
            door.position.set(SH_D / 2 + 0.01, 0.42, dir * (SH_W / 4 - T / 2));
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), mat(0xc9a35a, 0.3, { metalness: 0.8 }));
            handle.position.set(SH_D / 2 + 0.035, 0.52, dir * 0.05);
            shelf.add(door, handle);
        });
        [1.25, 1.75, SH_H - T / 2].forEach(y => {
            const board = new THREE.Mesh(new THREE.BoxGeometry(SH_D, T, SH_W - 2 * T), walnutMat);
            board.position.y = y;
            shelf.add(board);
        });
        // Books: muted spines plus a couple in the accent colour
        const bookMats = [mat(0xe8dccb), mat(0x8a8f6e), mat(0x3f3a36), mat(0xcdb79e)];
        const accentBookMat = mat(accentTarget.getHex(), 0.9);
        const placeBooks = (y, zStart, count, seed) => {
            let z = zStart;
            for (let i = 0; i < count; i++) {
                const h = 0.24 + ((seed * (i + 3)) % 7) * 0.025;
                const w = 0.05 + ((seed + i) % 3) * 0.012;
                const book = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, w), i % 4 === 1 ? accentBookMat : bookMats[(seed + i) % bookMats.length]);
                book.position.set(0, y + h / 2, z + w / 2);
                shelf.add(book);
                z += w + 0.005;
            }
        };
        placeBooks(0.8, -SH_W / 2 + T + 0.02, 8, 3);
        placeBooks(1.27, 0.05, 6, 5);
        const leaningBook = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.05), bookMats[1]);
        leaningBook.position.set(0, 1.27 + 0.15, -0.38);
        leaningBook.rotation.x = 0.25;
        const shelfVase = new THREE.Mesh(vaseGeometry(0.28, 0.08), mat(PALETTE.sage, 0.6, { side: THREE.DoubleSide }));
        shelfVase.position.set(0, 1.77, -0.3);
        const shelfOrb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), mat(0xefe6da, 0.5));
        shelfOrb.position.set(0, 1.85, 0.05);
        const stack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.2), bookMats[0]);
        stack.position.set(0, 1.81, 0.35);
        shelf.add(leaningBook, shelfVase, shelfOrb, stack);
        shelf.position.set(-2.8 + SH_D / 2, 0, 2.25);
        room.add(shelf);

        // --- Pendant lamps: one over the coffee table, one over the dining table ---
        const shadeMat = mat(accentTarget.getHex(), 0.6, { side: THREE.DoubleSide });
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc27a, emissiveIntensity: 0.3 });
        const lamps = [];
        const pendants = [];
        const makePendant = (x, y, z, cordLen, size = 1) => {
            const pendant = new THREE.Group();
            const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cordLen, 6), frameMat);
            cord.position.y = cordLen / 2;
            const shade = new THREE.Mesh(new THREE.SphereGeometry(0.32, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), shadeMat);
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 12), bulbMat);
            bulb.position.y = 0.02;
            const lamp = new THREE.PointLight(0xffb36b, 0, 0, 2);
            lamp.position.y = -0.08;
            shade.scale.setScalar(size);
            bulb.scale.setScalar(size);
            pendant.add(cord, shade, bulb, lamp);
            pendant.position.set(x, y, z);
            room.add(pendant);
            lamps.push(lamp);
            pendants.push(pendant);
        };
        makePendant(-1.0, 2.3, -0.95, 1.3);
        lamps[0].userData.boost = 1.4; // living-area pendant, brighter over the sofa
        makePendant(1.25, 1.4, 1.75, 2.2, 0.7);

        // --- Floor lamp beside the sofa: warms up the seating corner in the evening ---
        const floorLamp = new THREE.Group();
        const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 32), frameMat);
        lampBase.position.y = 0.015;
        const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 8), frameMat);
        lampStem.position.y = 0.7;
        const linenMat = new THREE.MeshStandardMaterial({
            color: 0xf4ead8, roughness: 1, side: THREE.DoubleSide, emissive: 0xffc27a, emissiveIntensity: 0,
        });
        const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.32, 32, 1, true), linenMat);
        lampShade.position.y = 1.5;
        const floorLight = new THREE.PointLight(0xffb36b, 0, 0, 2);
        floorLight.position.y = 1.42;
        floorLight.userData.boost = 1.1;
        floorLamp.add(lampBase, lampStem, lampShade, floorLight);
        floorLamp.position.set(0.55, 0, -2.45);
        room.add(floorLamp);
        lamps.push(floorLight);

        enableShadows(room);
        sky.castShadow = false;
        pendants.forEach(p => p.traverse(o => { o.castShadow = false; }));

        // --- Moods ---
        const MOODS = {
            day: { hemi: 1.7, fill: 0.9, sun: 3.0, lamp: 0, bulb: 0.3, sky: 0xfff3e0, bg: '#F6F2EE' },
            evening: { hemi: 0.35, fill: 0.08, sun: 0, lamp: 7, bulb: 3, sky: 0x2b2f24, bg: '#2F3226' },
        };
        let mood = MOODS.day;
        const skyTarget = new THREE.Color(mood.sky);

        section.querySelectorAll('[data-mood]').forEach(btn => {
            btn.addEventListener('click', () => {
                mood = MOODS[btn.dataset.mood];
                skyTarget.setHex(mood.sky);
                frame.style.backgroundColor = mood.bg;
                section.querySelectorAll('[data-mood]').forEach(b => b.classList.toggle('is-active', b === btn));
            });
        });
        const accentMats = [sofaMat, rugBorder.material, sideOrb.material, artSun.material, shadeMat, accentBookMat];
        section.querySelectorAll('[data-palette]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [wall, accent] = btn.dataset.palette.split(',');
                wallTarget.set(wall);
                accentTarget.set(accent);
                section.querySelectorAll('[data-palette]').forEach(b => b.classList.toggle('is-active', b === btn));
            });
        });

        // --- Drag to turn the diorama ---
        let yaw = 0, targetYaw = 0, dragging = false, lastX = 0, lastInteraction = -10;
        canvas.addEventListener('pointerdown', e => {
            dragging = true;
            lastX = e.clientX;
            canvas.setPointerCapture(e.pointerId);
            if (hint) hint.classList.add('opacity-0');
        });
        canvas.addEventListener('pointermove', e => {
            if (!dragging) return;
            targetYaw = Math.max(-0.75, Math.min(0.75, targetYaw + (e.clientX - lastX) * 0.006));
            lastX = e.clientX;
        });
        const release = () => { dragging = false; lastInteraction = performance.now() / 1000; };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);

        const entry = {
            canvas, renderer, scene, camera, visible: false,
            update(t, dt) {
                // Gentle idle sway once the visitor lets go
                if (!dragging && !reduceMotion && t - lastInteraction > 3) {
                    targetYaw = damp(targetYaw, Math.sin(t * 0.3) * 0.22, 0.6, dt);
                }
                yaw = damp(yaw, targetYaw, 6, dt);
                room.rotation.y = yaw;
                if (!reduceMotion) pendants.forEach((p, i) => { p.rotation.z = Math.sin(t * 0.9 + i) * 0.02; });

                hemi.intensity = damp(hemi.intensity, mood.hemi, 4, dt);
                fill.intensity = damp(fill.intensity, mood.fill, 4, dt);
                sun.intensity = damp(sun.intensity, mood.sun, 4, dt);
                lamps.forEach(l => { l.intensity = damp(l.intensity, mood.lamp * (l.userData.boost || 1), 4, dt); });
                bulbMat.emissiveIntensity = damp(bulbMat.emissiveIntensity, mood.bulb, 4, dt);
                linenMat.emissiveIntensity = damp(linenMat.emissiveIntensity, mood.bulb * 0.25, 4, dt);
                skyMat.color.lerp(skyTarget, 1 - Math.exp(-4 * dt));
                const blend = 1 - Math.exp(-5 * dt);
                wallMat.color.lerp(wallTarget, blend);
                pillowMat.color.lerp(wallTarget, blend);
                chairMat.color.lerp(chairTarget.copy(wallTarget).multiplyScalar(0.85), blend);
                accentMats.forEach(m => m.color.lerp(accentTarget, blend));
                // Seat cushions a shade lighter than the frame
                cushionMat.color.lerp(cushionTarget.copy(accentTarget).lerp(new THREE.Color(0xffffff), 0.08), blend);
            },
        };
        watchCanvas(entry, aspect => {
            camera.aspect = aspect;
            // Widen the lens on tall frames so the whole room stays in view
            camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(0.33, 0.39 / aspect)));
            camera.updateProjectionMatrix();
        });
        return entry;
    }

    function plankTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const ctx = c.getContext('2d');
        const tones = ['#c4a487', '#bd9c7f', '#caab8f', '#c1a084', '#b8977a'];
        const plank = 64;
        for (let i = 0; i < 512 / plank; i++) {
            ctx.fillStyle = tones[i % tones.length];
            ctx.fillRect(i * plank, 0, plank, 512);
            ctx.fillStyle = 'rgba(80, 55, 35, 0.35)';
            ctx.fillRect(i * plank, 0, 2, 512);
            const seam = (i * 197) % 512;
            ctx.fillRect(i * plank, seam, plank, 2);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
    }

    function showFallbacks() {
        const studio = document.getElementById('studio-3d');
        if (studio) {
            studio.querySelectorAll('[data-3d-fallback]').forEach(el => el.classList.remove('hidden'));
            studio.querySelectorAll('[data-3d-controls], .studio-hint').forEach(el => el.classList.add('hidden'));
        }
    }
})();
