(function sheepRuntime() {
	// Run inline in the head (as the admin's preview does), it waits for the page.
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => sheepRuntime(), { once: true });
		return;
	}
	const body = document.body;
	if (!body || !body.classList.contains("effect-sheep")) return;
	const NS = "http://www.w3.org/2000/svg";
	const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
	// Each sheep's way overlaps its neighbours', so two or three are in the air at once and the
	// flock rises as a stream; OVERLAP sheep-lengths of the page each.
	const OVERLAP = 2.4;
	const el = (name, attrs, parent) => {
		const node = document.createElementNS(NS, name);
		for (const key in attrs) node.setAttribute(key, String(attrs[key]));
		if (parent) parent.appendChild(node);
		return node;
	};
	const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
	const smooth = (a, b, x) => {
		const t = clamp((x - a) / (b - a), 0, 1);
		return t * t * (3 - 2 * t);
	};
	const lerp = (a, b, t) => a + (b - a) * t;
	const ease = (t) => .5 - Math.cos(Math.PI * t) / 2;
	const n2 = (x) => Math.round(x * 100) / 100;
	const svg = el("svg", {
		class: "sheep-sky",
		"aria-hidden": "true",
		focusable: "false"
	});
	// The water of the puddle, lit from the upper left, and the sun's glow.
	const defs = el("defs", {}, svg);
	const water = el("radialGradient", {
		id: "sheep-water",
		cx: "0.4",
		cy: "0.35",
		r: "0.75"
	}, defs);
	el("stop", {
		offset: "0",
		"stop-color": "#a6dafa"
	}, water);
	el("stop", {
		offset: "1",
		"stop-color": "#6cb6ec"
	}, water);
	const halo = el("radialGradient", { id: "sheep-sun-glow" }, defs);
	el("stop", {
		offset: "0",
		"stop-color": "#fffbea",
		"stop-opacity": "0.95"
	}, halo);
	el("stop", {
		offset: "0.3",
		"stop-color": "#fff3c9",
		"stop-opacity": "0.6"
	}, halo);
	el("stop", {
		offset: "1",
		"stop-color": "#fff3c9",
		"stop-opacity": "0"
	}, halo);
	const pool = el("g", { class: "sheep-pool" }, svg);
	// At the end of the article the sun comes out where the clouds leave sky; at night (the page's
	// stylesheet shows one or the other) a few stars light up there instead.
	const sun = el("g", {
		class: "sheep-sun",
		opacity: 0
	}, svg);
	el("circle", {
		r: 52,
		fill: "url(#sheep-sun-glow)"
	}, sun);
	el("circle", {
		r: 15,
		fill: "#fffdf5"
	}, sun);
	const stars = el("g", { class: "sheep-stars" }, svg);
	const shadows = el("g", {}, svg);
	const flock = el("g", {}, svg);
	body.insertBefore(svg, body.firstChild);
	// The scene's frame, measured every frame since the header and footer move with the page.
	const view = {
		w: 0,
		h: 0,
		left: 8,
		right: 0,
		top: 0,
		bottom: 0,
		k: 1,
		count: 0
	};
	const puddle = {
		x: 0,
		y: 0,
		rx: 0,
		ry: 0
	};
	let sheep = [];
	let slots = [];
	let starPlaces = [];
	let sunPlace;
	let builtFor = "";
	function measure() {
		view.w = innerWidth;
		view.h = innerHeight;
		const column = document.querySelector(".post") || document.querySelector("main");
		const header = document.querySelector(".site-header");
		const footer = document.querySelector(".site-footer");
		view.right = column ? column.getBoundingClientRect().left - 18 : 0;
		view.top = Math.max(10, header ? header.getBoundingClientRect().bottom + 14 : 10);
		view.bottom = Math.min(view.h, footer ? footer.getBoundingClientRect().top : view.h) - 12;
		const room = view.right - view.left;
		// Wide margins hold the whole flock; narrower ones fewer, smaller sheep; phones a mini flock
		// hugging the edge.
		const [count, k] = room >= 220 ? [14, 1] : room >= 120 ? [10, .8] : [6, .6];
		view.count = room >= 40 ? count : 0;
		view.k = k * .8;
	}
	// A sheep, drawn around its body's centre: wool in a ring of puffs, a black head, four short
	// black legs, and the extra puffs it grows as it turns into a cloud. Plain white, with no edge
	// and no shading: the page is sky, so white stands out on its own, and the sheep that make one
	// cloud merge into one white shape with nothing drawn where they overlap. The colours are the
	// stylesheet's (classes), with these as defaults.
	const WHITE = "#fff";
	function makeSheep() {
		const shadow = el("ellipse", {
			rx: 16,
			ry: 4,
			fill: "rgba(24, 72, 120, .16)",
			class: "sheep-ground"
		}, shadows);
		const root = el("g", {}, flock);
		const legs = el("g", {}, root);
		const legBars = [
			-9,
			-3.5,
			3.5,
			9
		].map((x) => el("rect", {
			x: x - 2.2,
			y: 8,
			width: 4.4,
			height: 13,
			rx: 2.2,
			fill: "#16171c"
		}, legs));
		const wool = el("g", {}, root);
		const puffs = [];
		for (let i = 0; i < 11; i++) {
			const a = i / 11 * Math.PI * 2;
			puffs.push([
				n2(Math.cos(a) * 15),
				n2(Math.sin(a) * 10.5),
				i % 2 ? 6.6 : 7.6
			]);
		}
		el("ellipse", {
			cx: 0,
			cy: 0,
			rx: 16,
			ry: 12.5,
			fill: WHITE,
			class: "sheep-white"
		}, wool);
		for (const [cx, cy, r] of puffs) el("circle", {
			cx,
			cy,
			r,
			fill: WHITE,
			class: "sheep-white"
		}, wool);
		const places = [
			[
				-12,
				-15,
				9
			],
			[
				1,
				-20,
				11.5
			],
			[
				13,
				-14,
				9
			],
			[
				-23,
				-3,
				7.5
			],
			[
				24,
				-3,
				7.5
			],
			[
				0,
				9,
				0
			]
		];
		const tuftAt = places.map(([x, y]) => `translate(${x} ${y})`);
		const tufts = places.map(([, , r], i) => {
			const g = el("g", { transform: `${tuftAt[i]} scale(0)` }, root);
			if (i === 5) el("ellipse", {
				rx: 27,
				ry: 8.5,
				fill: WHITE,
				class: "sheep-white"
			}, g);
			else el("circle", {
				r,
				fill: WHITE,
				class: "sheep-white"
			}, g);
			return g;
		});
		const head = el("g", {}, root);
		el("ellipse", {
			rx: 7,
			ry: 8.6,
			fill: "#16171c"
		}, head);
		const facing = Math.random() < .5 ? -1 : 1, back = Math.random() < .3;
		return {
			root,
			legs,
			wool,
			head,
			shadow,
			tufts,
			tuftAt,
			legBars,
			u: 0,
			v: 0,
			tu: 0,
			tv: 0,
			pause: Math.random() * 3,
			walking: false,
			phase: Math.random() * 6,
			facing,
			aim: back ? 0 : facing,
			look: back ? 0 : facing,
			back,
			launched: false,
			lu: 0,
			lv: 0,
			drift: Math.random() * 6.28,
			last: []
		};
	}
	// Draws the puddle in its own coordinates; it moves as a whole when the footer pushes it up.
	function drawPuddle() {
		while (pool.firstChild) pool.removeChild(pool.firstChild);
		const { rx, ry } = puddle;
		el("ellipse", {
			rx: n2(rx),
			ry: n2(ry),
			fill: "url(#sheep-water)",
			class: "sheep-water"
		}, pool);
		el("ellipse", {
			cx: n2(-rx * .22),
			cy: n2(-ry * .18),
			rx: n2(rx * .5),
			ry: n2(ry * .34),
			fill: "#eef8ff",
			opacity: .55,
			class: "sheep-glint"
		}, pool);
		el("ellipse", {
			cx: n2(rx * .34),
			cy: n2(ry * .3),
			rx: n2(rx * .26),
			ry: n2(ry * .18),
			fill: "#eef8ff",
			opacity: .4,
			class: "sheep-glint"
		}, pool);
		const sparks = Math.round(10 + rx / 12);
		for (let i = 0; i < sparks; i++) {
			const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * .86, size = (2.2 + Math.random() * 2.8) * Math.max(.7, view.k);
			const p = el("path", {
				d: `M0 ${n2(-size)}L${n2(size * .8)} ${n2(size * .6)}L${n2(-size * .8)} ${n2(size * .6)}Z`,
				fill: "#fff",
				class: "sheep-spark",
				transform: `translate(${n2(Math.cos(a) * r * rx)} ${n2(Math.sin(a) * r * ry)}) rotate(${Math.round(Math.random() * 120)})`
			}, pool);
			p.style.animationDelay = `${(-Math.random() * 2.6).toFixed(2)}s`;
		}
	}
	// Where the clouds gather: two clusters high in the margin, each a cumulus of puffs, bottom row
	// first. The first sheep to leave fill the higher cloud.
	function placeClouds() {
		const k = view.k, count = view.count, room = view.right - view.left;
		const puff = 58 * k * 1.55;
		const half = Math.ceil(count / 2);
		const clusters = [half, count - half];
		slots = [];
		const wide = room > puff * 2.2;
		let y = view.top + puff * .95;
		clusters.forEach((size, c) => {
			const bottom = Math.ceil(size / 2), top = size - bottom;
			let step = puff * .56;
			const width = (bottom - 1) * step + puff;
			if (width > room - 8) step = Math.max(puff * .18, (room - 8 - puff) / Math.max(1, bottom - 1));
			const span = (bottom - 1) * step + puff;
			const x0 = view.left + (wide ? (c === 0 ? .08 : .42) * Math.max(0, room - span) : Math.max(0, room - span) / 2) + puff / 2;
			for (let j = 0; j < bottom; j++) slots.push({
				x: x0 + j * step,
				y
			});
			for (let j = 0; j < top; j++) slots.push({
				x: x0 + (j + .5) * step,
				y: y - puff * (j === Math.floor((top - 1) / 2) ? .5 : .36)
			});
			y += puff * (wide ? 1.15 : 1.05);
		});
		// The sun comes out from behind the higher cloud, at its upper right; the cloud is drawn over it.
		const high = slots.slice(0, clusters[0]);
		sunPlace = high.length ? {
			x: Math.min(view.right - 16, Math.max(...high.map((p) => p.x)) + puff * .12),
			y: Math.max(view.top + 12, Math.min(...high.map((p) => p.y)) - puff * .3)
		} : undefined;
		// Stars light up where the clouds leave sky: spots near the top, clear of every puff and of
		// each other.
		const free = [];
		for (let fy = 0; fy <= 1; fy += .25) for (let fx = .06; fx < 1; fx += .08) free.push({
			x: view.left + fx * room,
			y: view.top + 6 + fy * puff * 2.2
		});
		const away = (p, from) => Math.min(9e9, ...from.map((q) => Math.hypot(q.x - p.x, (q.y - p.y) * 1.4)));
		const open = free.filter((p) => away(p, slots) > puff * .7);
		starPlaces = [];
		while (starPlaces.length < 3 && open.length) {
			const pick = open.reduce((a, b) => (starPlaces.length ? away(b, starPlaces) > away(a, starPlaces) : b.y < a.y) ? b : a);
			if (starPlaces.length && away(pick, starPlaces) < puff * .5) break;
			starPlaces.push(pick);
		}
	}
	function build() {
		measure();
		const room = view.right - view.left;
		const key = `${view.count}|${Math.round(room / 8)}`;
		if (key === builtFor) return;
		builtFor = key;
		svg.style.display = view.count ? "" : "none";
		if (!view.count) return;
		const k = view.k;
		// The puddle holds the flock with room to spare, as wide as the margin allows.
		puddle.rx = Math.min(170, (room - 8) / 2);
		puddle.ry = Math.max(puddle.rx * .3, view.count * 1500 * k * k / (Math.PI * puddle.rx), 14 * k);
		drawPuddle();
		placeClouds();
		while (stars.firstChild) stars.removeChild(stars.firstChild);
		starPlaces.forEach(() => el("path", {
			d: "M0 -6C.8 -1.6 1.6 -.8 6 0C1.6 .8 .8 1.6 0 6C-.8 1.6 -1.6 .8 -6 0C-1.6 -.8 -.8 -1.6 0 -6Z",
			fill: "#cfe2ff",
			opacity: 0
		}, stars));
		// Keep the sheep there are, so a resize does not reshuffle the flock.
		while (sheep.length > view.count) {
			const s = sheep.pop();
			s.root.remove();
			s.shadow.remove();
		}
		while (sheep.length < view.count) {
			const s = makeSheep();
			const [u, v] = pickSpot(s);
			s.u = s.tu = u;
			s.v = s.tv = v;
			sheep.push(s);
		}
	}
	// A spot in the puddle away from the other sheep: the best of a few random tries.
	function pickSpot(self) {
		let best = [0, 0], bestGap = -1;
		for (let i = 0; i < 6; i++) {
			const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * .72;
			const u = Math.cos(a) * r, v = Math.sin(a) * r;
			let gap = 9;
			for (const o of sheep) if (o !== self && !o.launched) gap = Math.min(gap, Math.hypot((o.u - u) * puddle.rx, (o.v - v) * puddle.ry));
			if (gap > bestGap) {
				bestGap = gap;
				best = [u, v];
			}
		}
		return best;
	}
	function graze(s, dt) {
		const k = view.k;
		if (!s.walking) {
			s.pause -= dt;
			if (s.pause <= 0 && !reduced) {
				[s.tu, s.tv] = pickSpot(s);
				s.walking = true;
			}
		}
		if (s.walking) {
			const dx = (s.tu - s.u) * puddle.rx, dy = (s.tv - s.v) * puddle.ry, dist = Math.hypot(dx, dy);
			const step = 11 * k * dt;
			if (dist <= step) {
				s.u = s.tu;
				s.v = s.tv;
				s.walking = false;
				s.pause = 1.5 + Math.random() * 3.5;
				s.back = Math.random() < .25;
				s.aim = s.back ? 0 : Math.random() < .3 ? 0 : s.facing;
			} else {
				s.u += dx / dist * step / puddle.rx;
				s.v += dy / dist * step / puddle.ry;
				if (Math.abs(dx) > .5) s.facing = dx < 0 ? -1 : 1;
				s.aim = s.facing;
				s.back = false;
				s.phase += dt * 9;
			}
		}
	}
	function setAttr(s, i, node, name, value) {
		if (s.last[i] === value) return;
		s.last[i] = value;
		node.setAttribute(name, value);
	}
	let progress = 0, target = 0, last = 0, clock = 0, frame = 0;
	const readTarget = () => {
		const max = document.documentElement.scrollHeight - innerHeight;
		target = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
	};
	function render(now) {
		const dt = Math.min(.05, last ? (now - last) / 1e3 : 0);
		last = now;
		clock += dt;
		// The scene follows the page smoothly, never jumping, whatever the scrolling does.
		progress = reduced ? target : progress + (target - progress) * (1 - Math.pow(.9, dt * 60));
		if (Math.abs(target - progress) < 4e-4) progress = target;
		build();
		if (view.count) draw(dt);
		requestAnimationFrame(render);
	}
	function draw(dt) {
		const k = view.k, n = sheep.length;
		puddle.x = view.left + 4 + puddle.rx;
		puddle.y = view.bottom - puddle.ry - 10 * k;
		pool.setAttribute("transform", `translate(${n2(puddle.x)} ${n2(puddle.y)})`);
		pool.setAttribute("opacity", String(n2(.82 + .18 * progress)));
		const span = Math.min(1, OVERLAP / n);
		const edge = view.left + 22 * k;
		const glow = smooth(.86, 1, progress);
		// The sun breathes a little, slower than a star twinkles.
		if (sunPlace) {
			const breathe = reduced ? 1 : 1 + .035 * Math.sin(clock * .8);
			sun.setAttribute("opacity", String(n2(glow)));
			sun.setAttribute("transform", `translate(${n2(sunPlace.x)} ${n2(sunPlace.y)}) scale(${n2(breathe * Math.max(.7, k / .8))})`);
		}
		Array.prototype.forEach.call(stars.childNodes, (star, i) => {
			const p = starPlaces[i];
			const twinkle = reduced ? 1 : .75 + .25 * Math.sin(clock * 2.2 + i * 2.1);
			star.setAttribute("opacity", String(n2(glow * twinkle)));
			star.setAttribute("transform", `translate(${n2(p.x)} ${n2(p.y)}) scale(${n2(.95 * Math.max(.7, k / .8))})`);
		});
		sheep.forEach((s, i) => {
			const start = n > 1 ? i * (1 - span) / (n - 1) : 0;
			const t = clamp((progress - start) / span, 0, 1);
			if (t > 0 && !s.launched) {
				s.launched = true;
				s.lu = s.u;
				s.lv = s.v;
				s.walking = false;
			}
			if (t === 0 && s.launched) {
				s.launched = false;
				s.u = s.tu = s.lu;
				s.v = s.tv = s.lv;
				s.pause = .6 + Math.random() * 1.2;
			}
			if (!s.launched) graze(s, dt);
			const gu = s.launched ? s.lu : s.u, gv = s.launched ? s.lv : s.v;
			const groundX = puddle.x + gu * puddle.rx, groundY = puddle.y + gv * puddle.ry;
			const startX = groundX, startY = groundY - 21 * k;
			// Crouch, spring, then rise along the left edge and curve over into the cloud's place.
			const crouch = clamp(t / .1, 0, 1);
			const squash = t < .1 ? crouch < .5 ? -Math.sin(crouch * Math.PI) * .18 : Math.sin((crouch - .5) * 2 * Math.PI) * .12 : 0;
			const u = ease(clamp((t - .06) / .86, 0, 1));
			const slot = slots[i] || slots[slots.length - 1];
			const height = startY - slot.y;
			const p1x = edge, p1y = startY - height * .38;
			const p2x = lerp(edge, slot.x, .12), p2y = slot.y + height * .2;
			const iu = 1 - u;
			let x = iu * iu * iu * startX + 3 * iu * iu * u * p1x + 3 * iu * u * u * p2x + u * u * u * slot.x;
			let y = iu * iu * iu * startY + 3 * iu * iu * u * p1y + 3 * iu * u * u * p2y + u * u * u * slot.y;
			const sway = Math.sin(Math.PI * u);
			x += Math.sin(u * Math.PI * 4 + i) * 7 * k * sway;
			// Clouds drift a little in the sky.
			const sky = smooth(.85, 1, t) * (reduced ? 0 : 1);
			x += Math.sin(clock * .16 + s.drift) * 7 * k * sky;
			y += Math.sin(clock * .23 + s.drift * 1.7) * 2.6 * k * sky;
			// Grazing: a little bob while walking.
			let rot = Math.sin(u * Math.PI * 5 + i) * 7 * sway;
			if (!s.launched && s.walking) {
				y -= Math.abs(Math.sin(s.phase)) * 2 * k;
				rot += Math.sin(s.phase) * 3.5;
			}
			const m = smooth(.24, .86, t);
			const size = k * (1 + .55 * smooth(.3, 1, t));
			const half = 30 * size;
			x = clamp(x, view.left + half * .9, view.right - half * .9);
			s.look += (s.aim - s.look) * Math.min(1, dt * 7);
			setAttr(s, 0, s.root, "transform", `translate(${n2(x)} ${n2(y)}) rotate(${n2(rot)}) scale(${n2(size * (1 - squash * .5))} ${n2(size * (1 + squash))})`);
			const parts = 1 - smooth(0, .62, m);
			const step = !s.launched && s.walking ? Math.sin(s.phase) * 1.2 : 0;
			setAttr(s, 1, s.legs, "transform", `scale(${n2(parts)})`);
			s.legBars.forEach((bar, j) => setAttr(s, 10 + j, bar, "transform", `translate(0 ${n2(j % 2 ? step : -step)})`));
			setAttr(s, 2, s.wool, "transform", `scale(${n2(1 + .14 * m)} ${n2(1 + .06 * m)})`);
			const front = 1 - Math.abs(s.look);
			const hx = s.look * 17 * lerp(1, .35, 1 - parts), hy = lerp(1.5, 5, front);
			setAttr(s, 3, s.head, "transform", `translate(${n2(hx)} ${n2(hy)}) scale(${n2(parts * (1 - .15 * front))})`);
			// Seen from behind, the head is hidden by the wool: all white.
			setAttr(s, 4, s.head, "opacity", String(s.back && !s.launched ? n2(Math.abs(s.look)) : 1));
			s.tufts.forEach((tuft, j) => setAttr(s, 5 + j, tuft, "transform", `${s.tuftAt[j]} scale(${n2(smooth(.3 + j * .06, .78 + j * .03, t))})`));
			const lift = 1 - smooth(.04, .3, t);
			setAttr(s, 16, s.shadow, "transform", `translate(${n2(groundX)} ${n2(groundY + 3 * k)}) scale(${n2(k * (.4 + .6 * lift))})`);
			setAttr(s, 17, s.shadow, "opacity", String(n2(lift)));
		});
		// Sheep nearer the reader stand in front; clouds and sheep in the air above them all.
		if (++frame % 15 === 0) {
			const order = sheep.slice().sort((a, b) => (a.launched ? 1 : 0) - (b.launched ? 1 : 0) || (a.launched ? 0 : a.v - b.v));
			order.forEach((s, i) => {
				if (flock.childNodes[i] !== s.root) flock.appendChild(s.root);
			});
		}
	}
	addEventListener("scroll", readTarget, { passive: true });
	addEventListener("resize", () => {
		builtFor = "";
		readTarget();
	});
	readTarget();
	progress = target;
	requestAnimationFrame(render);
})();
