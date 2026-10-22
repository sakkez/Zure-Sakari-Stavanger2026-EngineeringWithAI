// Conifer needles: vertex-color shading with backlight, gentle sway, and a dithered cutout
// where the canopy sits between the camera and the hero.
shader_type spatial;
render_mode cull_disabled, diffuse_lambert_wrap;

uniform vec3 player_pos = vec3(0.0);
uniform float cut_radius = 4.0;

varying vec3 wp;

void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float h = max(VERTEX.y - 1.5, 0.0);
	float s = sin(TIME * 1.2 + wp.x * 0.15 + wp.z * 0.11) * 0.012 * h;
	VERTEX.x += s;
	VERTEX.z += s * 0.6;
}

float ign(vec2 p) {
	return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	vec3 target = player_pos + vec3(0.0, 1.0, 0.0);
	vec3 seg = target - cam;
	float t = clamp(dot(wp - cam, seg) / dot(seg, seg), 0.0, 1.0);
	float d = length(wp - (cam + seg * t));
	if (t < 0.985) {
		float keep = smoothstep(cut_radius * 0.55, cut_radius, d);
		if (keep < ign(FRAGCOORD.xy)) discard;
	}
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 0.85;
	SPECULAR = 0.2;
	BACKLIGHT = COLOR.rgb * vec3(0.5, 0.7, 0.4);
}
