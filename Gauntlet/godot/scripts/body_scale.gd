class_name BodyScale
extends SkeletonModifier3D
## Less chibi at the game camera: smaller head, slightly heavier torso and limbs, applied on top
## of every animation frame (same numbers as the browser version's BODY_SCALE).

const SCALES := {
	"head": Vector3(0.86, 0.86, 0.86),
	"chest": Vector3(1.07, 1.03, 1.07),
	"upperarm.l": Vector3(1.06, 1.06, 1.06),
	"upperarm.r": Vector3(1.06, 1.06, 1.06),
	"upperleg.l": Vector3(1.07, 1.04, 1.07),
	"upperleg.r": Vector3(1.07, 1.04, 1.07),
}

var _ids := {}


func _process_modification_with_delta(_delta: float) -> void:
	var sk := get_skeleton()
	if sk == null:
		return
	if _ids.is_empty():
		for b in SCALES:
			_ids[b] = sk.find_bone(b)
	for b in SCALES:
		var i: int = _ids[b]
		if i >= 0:
			sk.set_bone_pose_scale(i, SCALES[b])
