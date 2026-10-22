// HUD skill slot: procedural ability icon, bronze frame, radial cooldown sweep, out-of-mana tint.
shader_type canvas_item;

uniform int kind = 0;           // 0 fireball, 1 frost nova, 2 meteor, 3 blink
uniform float cd : hint_range(0.0, 1.0) = 0.0;  // remaining cooldown fraction
uniform float no_mana = 0.0;
uniform float ready_flash = 0.0;

vec3 icon(vec2 p) {
	float r = length(p);
	float a = atan(p.y, p.x);
	vec3 c = vec3(0.0);
	if (kind == 0) {
		vec2 q = p - vec2(0.12, -0.12);
		float core = smoothstep(0.32, 0.0, length(q));
		float tail = smoothstep(0.22, 0.0, abs(dot(q, normalize(vec2(1.0, 1.0))) * -1.0 + 0.0) + 0.0) * 0.0;
		vec2 t = q + vec2(0.22, -0.22);
		float trail = smoothstep(0.5, 0.0, length(t * vec2(1.0, 1.0)) ) * smoothstep(0.0, 0.2, dot(-q, normalize(vec2(1.0, -1.0))));
		c = vec3(1.0, 0.45, 0.08) * (core * 1.6 + trail * 0.7) + vec3(1.0, 0.9, 0.6) * pow(core, 3.0) + tail;
	} else if (kind == 1) {
		float star = pow(abs(cos(a * 3.0)), 18.0) * smoothstep(0.85, 0.2, r);
		float ring = smoothstep(0.06, 0.0, abs(r - 0.62)) * 0.8;
		c = vec3(0.45, 0.8, 1.0) * (star * 1.4 + ring + smoothstep(0.25, 0.0, r));
	} else if (kind == 2) {
		vec2 q = p - vec2(0.22, -0.22);
		float rock = smoothstep(0.24, 0.2, length(q));
		vec2 d = normalize(vec2(-1.0, 1.0));
		float along = dot(p - vec2(0.22, -0.22), d);
		float perp = abs(dot(p - vec2(0.22, -0.22), vec2(d.y, -d.x)));
		float streak = smoothstep(0.2, 0.0, perp) * smoothstep(0.0, 0.1, along) * smoothstep(0.9, 0.2, along);
		c = vec3(0.25, 0.1, 0.06) * rock + vec3(1.0, 0.35, 0.05) * (streak * 1.2 + smoothstep(0.32, 0.18, length(q)) * (1.0 - rock) * 1.5);
	} else if (kind == 3) {
		float spiral = smoothstep(0.25, 0.0, abs(fract((a / 6.2831) + r * 1.6 - TIME * 0.2) - 0.5) - 0.2) * smoothstep(0.85, 0.15, r);
		c = vec3(0.7, 0.4, 1.0) * (spiral * 1.2 + smoothstep(0.3, 0.0, r) * 0.8);
	} else if (kind == 4) {
		// cleave: bright crescent
		float cres = smoothstep(0.08, 0.0, abs(r - 0.55)) * smoothstep(-0.2, 0.6, -p.y + p.x * 0.3);
		c = vec3(1.0, 0.85, 0.6) * cres * 1.5 + vec3(0.5, 0.35, 0.2) * smoothstep(0.7, 0.0, r) * 0.3;
	} else if (kind == 5) {
		// whirlwind: two swirling blade arcs
		float sw = abs(fract(a / 3.14159 + r * 0.8) - 0.5);
		float blades = smoothstep(0.1, 0.0, sw - 0.05) * smoothstep(0.85, 0.3, r) * smoothstep(0.1, 0.3, r);
		c = vec3(0.95, 0.75, 0.45) * blades * 1.3;
	} else if (kind == 6) {
		// earthshatter: cracks radiating from an impact
		float cracks = pow(abs(cos(a * 3.5 + sin(r * 9.0) * 0.4)), 30.0) * smoothstep(0.9, 0.1, r);
		c = vec3(1.0, 0.5, 0.15) * (cracks * 1.4 + smoothstep(0.25, 0.0, r)) + vec3(0.25, 0.18, 0.12) * smoothstep(0.9, 0.6, r);
	} else if (kind == 7) {
		// charge: double chevron
		float ch = 0.0;
		for (int i = 0; i < 2; i++) {
			vec2 q = p + vec2(0.25 - float(i) * 0.4, 0.0);
			ch += smoothstep(0.09, 0.0, abs(abs(q.y) * 0.9 + q.x - 0.25)) * step(abs(q.y), 0.5) * step(q.x, 0.3);
		}
		c = vec3(0.95, 0.8, 0.55) * ch;
	} else if (kind == 8 || kind == 9) {
		// bolt / multishot: one or three bolts flying up-right
		float b = 0.0;
		int n = kind == 8 ? 1 : 3;
		for (int i = 0; i < n; i++) {
			float ang = 0.785 + (float(i) - float(n - 1) * 0.5) * 0.35;
			vec2 d = vec2(cos(ang), -sin(ang));
			float along = dot(p, d);
			float perp = abs(dot(p, vec2(-d.y, d.x)));
			b += smoothstep(0.05, 0.0, perp) * smoothstep(-0.7, -0.5, along) * smoothstep(0.75, 0.6, along);
			b += smoothstep(0.12, 0.0, length(p - d * 0.65)) * 0.8;
		}
		c = vec3(1.0, 0.9, 0.65) * b;
	} else if (kind == 10) {
		// rain of arrows: falling streaks over a golden ring
		float streaks = 0.0;
		for (int i = 0; i < 5; i++) {
			float x = -0.5 + float(i) * 0.25;
			float y0 = -0.6 + fract(float(i) * 0.37) * 0.3;
			streaks += smoothstep(0.04, 0.0, abs(p.x - x - (p.y - y0) * 0.25)) * step(y0, p.y) * step(p.y, y0 + 0.5);
		}
		float ring = smoothstep(0.05, 0.0, abs(length((p - vec2(0.0, 0.45)) * vec2(1.0, 3.0)) - 0.6));
		c = vec3(1.0, 0.85, 0.5) * (streaks + ring * 0.8);
	} else {
		// roll: circular arrow
		float arcm = smoothstep(0.07, 0.0, abs(r - 0.5)) * step(-2.4, a) * step(a, 2.2);
		vec2 tip = vec2(cos(2.2), sin(2.2)) * 0.5;
		float head = smoothstep(0.16, 0.0, length(p - tip));
		c = vec3(0.45, 0.95, 0.55) * (arcm + head);
	}
	return c;
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	vec2 ap = abs(p);
	float box = max(ap.x, ap.y);
	vec3 col = mix(vec3(0.06, 0.05, 0.045), vec3(0.015), length(p) * 0.6);
	col += icon(p * 1.15);
	float frame = smoothstep(0.86, 0.9, box);
	vec3 bronze = mix(vec3(0.35, 0.25, 0.13), vec3(0.8, 0.62, 0.36), clamp(0.5 - p.y * 0.5, 0.0, 1.0));
	col = mix(col, bronze, frame);
	float inner_line = smoothstep(0.8, 0.83, box) * smoothstep(0.86, 0.83, box);
	col *= 1.0 - inner_line * 0.7;
	// cooldown sweep (clockwise from 12 o'clock)
	float ang = fract(atan(p.x, -p.y) / 6.2831853 + 1.0);
	if (cd > 0.0 && box < 0.86) {
		float covered = step(1.0 - cd, ang);
		col = mix(col, col * 0.22, covered);
		col += vec3(1.0, 0.8, 0.5) * smoothstep(0.02, 0.0, abs(ang - (1.0 - cd))) * 0.4 * step(box, 0.86);
	}
	col = mix(col, col * vec3(0.35, 0.4, 0.9), no_mana * 0.7);
	col += vec3(1.0, 0.85, 0.5) * ready_flash * (1.0 - box) * 0.8;
	COLOR = vec4(col, 1.0);
}
