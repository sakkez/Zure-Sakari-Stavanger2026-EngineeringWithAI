// Additive billboard particle: procedural soft blob broken up by scrolling noise (fire, sparks, magic).
shader_type spatial;
render_mode blend_add, unshaded, depth_draw_never, cull_disabled, shadows_disabled;

uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform sampler2D depth_tex : hint_depth_texture, filter_linear_mipmap;
uniform float breakup = 0.6;
uniform float softness = 1.6;
uniform float boost = 2.5;
uniform vec4 tint : source_color = vec4(1.0);

varying float age;
varying float seed;

void vertex() {
	age = INSTANCE_CUSTOM.y;
	seed = float(INSTANCE_ID) * 0.6180339;
	mat4 w = mat4(normalize(INV_VIEW_MATRIX[0]), normalize(INV_VIEW_MATRIX[1]), normalize(INV_VIEW_MATRIX[2]), MODEL_MATRIX[3]);
	float a = INSTANCE_CUSTOM.x;
	w = w * mat4(vec4(cos(a), -sin(a), 0.0, 0.0), vec4(sin(a), cos(a), 0.0, 0.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_MATRIX = VIEW_MATRIX * w;
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float shape = pow(max(1.0 - r, 0.0), softness);
	float n = texture(noise_tex, UV * 0.55 + vec2(fract(seed), fract(seed * 7.3)) + vec2(0.0, age * 0.7)).r;
	float a = shape * mix(1.0, smoothstep(0.15, 0.75, n + shape * 0.45), breakup);
	float d = texture(depth_tex, SCREEN_UV).r;
	vec4 v = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, d, 1.0);
	v.xyz /= v.w;
	a *= clamp((VERTEX.z - v.z) / 0.6, 0.0, 1.0);
	ALBEDO = COLOR.rgb * tint.rgb * boost;
	ALPHA = clamp(a * COLOR.a * tint.a, 0.0, 1.0);
}
