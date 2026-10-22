// Final grade over the 3D frame (below the HUD): cool shadows / warm highlights split-tone,
// gentle S-curve, slight desaturation of mid-tones, and a soft oval vignette.
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float vignette = 0.5;
uniform vec3 shadow_tint = vec3(0.86, 0.94, 1.08);
uniform vec3 high_tint = vec3(1.07, 1.0, 0.88);

void fragment() {
	vec3 c = texture(screen_tex, SCREEN_UV).rgb;
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c *= mix(shadow_tint, high_tint, smoothstep(0.04, 0.55, l));
	c = mix(vec3(l), c, mix(0.9, 1.05, smoothstep(0.3, 0.8, l)));
	c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
	vec2 p = (UV - 0.5) * vec2(1.0, 1.25);
	float v = 1.0 - vignette * smoothstep(0.3, 0.85, length(p));
	COLOR = vec4(c * v, 1.0);
}
