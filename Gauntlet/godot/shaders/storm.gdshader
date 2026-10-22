// Battle-royale storm wall: an open cylinder of swirling arcane cloud, brightest at its base,
// fading upward, with occasional lightning pulses.
shader_type spatial;
render_mode blend_add, unshaded, cull_disabled, depth_draw_never, shadows_disabled;

uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform vec3 color : source_color = vec3(0.5, 0.22, 1.0);
uniform float pulse = 0.0;

varying vec3 lp;
varying vec3 wn;
varying vec3 wp;

void vertex() {
	lp = VERTEX;
	wn = normalize((MODEL_MATRIX * vec4(VERTEX.x, 0.0, VERTEX.z, 0.0)).xyz);
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float ang = atan(lp.z, lp.x) / 6.2831853;
	float h = lp.y;  // -13 .. 13
	vec2 uv = vec2(ang * 9.0 + TIME * 0.035, h * 0.045 - TIME * 0.06);
	float n = texture(noise_tex, uv).r * 0.6 + texture(noise_tex, uv * 2.3 + vec2(TIME * 0.02, 0.0)).r * 0.4;
	float base = 1.0 - smoothstep(-6.0, 8.0, h);
	float body = smoothstep(0.35, 0.8, n) * (1.0 - smoothstep(-2.0, 13.0, h));
	float a = base * 0.35 + body * 0.75;
	// the near side of the wall stands between camera and fight: keep it a faint shimmer
	vec3 to_cam = normalize(CAMERA_POSITION_WORLD - wp);
	float near_side = smoothstep(-0.1, 0.45, dot(wn, to_cam));
	a *= mix(1.0, 0.12, near_side);
	a *= 1.0 - smoothstep(-4.0, 6.0, h) * near_side;
	vec3 c = mix(color, vec3(0.85, 0.75, 1.0), smoothstep(0.7, 0.95, n));
	c += vec3(0.7, 0.8, 1.0) * pulse * smoothstep(0.6, 0.9, n);
	ALBEDO = c * 1.6;
	ALPHA = clamp(a * 0.6, 0.0, 1.0);
}
