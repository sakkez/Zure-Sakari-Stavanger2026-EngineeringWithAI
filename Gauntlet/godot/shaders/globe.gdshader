// HUD liquid globe: sloshing liquid in a dark glass sphere with a bronze rim and specular highlight.
shader_type canvas_item;

uniform float fill : hint_range(0.0, 1.0) = 1.0;
uniform vec4 liquid : source_color = vec4(0.7, 0.06, 0.05, 1.0);

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float aa = fwidth(r) * 1.5;
	float inner = 0.84;
	vec3 col = vec3(0.02, 0.018, 0.016);
	float level = 1.0 - fill * 2.0 * inner - (1.0 - inner);
	float wave = sin(p.x * 5.0 + TIME * 2.2) * 0.025 + sin(p.x * 9.0 - TIME * 3.1) * 0.012;
	float in_liquid = smoothstep(level + wave - 0.01, level + wave + 0.01, p.y);
	float swirl = sin(p.x * 7.0 + p.y * 4.0 + TIME * 1.3) * 0.5 + 0.5;
	vec3 lc = liquid.rgb * mix(1.25, 0.35, smoothstep(0.0, inner, r)) * mix(0.85, 1.15, swirl);
	lc += liquid.rgb * 0.6 * smoothstep(0.03, 0.0, abs(p.y - level - wave)) * step(r, inner);
	col = mix(col, lc, in_liquid);
	// glass highlight
	float hl = smoothstep(0.35, 0.0, length((p - vec2(-0.3, -0.42)) * vec2(1.0, 1.8)));
	col += vec3(0.9, 0.85, 0.8) * hl * 0.35;
	// bronze rim
	float rim_t = smoothstep(inner - aa, inner + aa, r);
	vec3 bronze = mix(vec3(0.42, 0.3, 0.16), vec3(0.85, 0.66, 0.38), clamp(0.5 - p.y * 0.6, 0.0, 1.0));
	bronze *= 0.75 + 0.25 * sin(atan(p.y, p.x) * 24.0);
	col = mix(col, bronze, rim_t);
	float edge = smoothstep(inner + 0.02, inner, r) * 0.0 + smoothstep(inner, inner + 0.03, r) * smoothstep(inner + 0.06, inner + 0.03, r);
	col *= 1.0 - edge * 0.6;
	float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, r);
	COLOR = vec4(col, alpha);
}
