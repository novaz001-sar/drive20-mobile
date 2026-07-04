import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def get_arg(flag, fallback=None):
    if flag not in sys.argv:
        return fallback
    index = sys.argv.index(flag)
    return sys.argv[index + 1] if index + 1 < len(sys.argv) else fallback


OUTPUT_PATH = Path(get_arg("--output", r"E:\Codex\projects\drive20-mobile\src\assets\models\optimized\free-waypoint-frieza-salute.glb"))


MATERIALS = {}
CREATED_OBJECTS = {}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def create_materials():
    specs = {
        "white_shell": (0.72, 0.76, 0.88, 1.0, 0.18, 0.24),
        "purple_armor": (0.62, 0.05, 0.95, 1.0, 0.24, 0.18),
        "deep_purple": (0.04, 0.0, 0.08, 1.0, 0.12, 0.32),
        "black_joint": (0.012, 0.01, 0.018, 1.0, 0.08, 0.38),
        "gold_salute": (1.0, 0.67, 0.18, 1.0, 0.22, 0.25),
        "glow_blue": (0.16, 0.75, 1.0, 1.0, 0.0, 0.18),
        "red_eye": (1.0, 0.04, 0.08, 1.0, 0.0, 0.22),
        "pink_energy": (1.0, 0.22, 0.72, 1.0, 0.0, 0.18),
    }
    for name, (r, g, b, a, metallic, roughness) in specs.items():
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (r, g, b, a)
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = metallic
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = roughness
            if "Emission Color" in bsdf.inputs and name in {"gold_salute", "glow_blue", "red_eye", "pink_energy"}:
                bsdf.inputs["Emission Color"].default_value = (r, g, b, a)
            if "Emission Strength" in bsdf.inputs and name in {"gold_salute", "glow_blue", "red_eye", "pink_energy"}:
                bsdf.inputs["Emission Strength"].default_value = 0.85 if name in {"red_eye", "pink_energy"} else 0.55
        MATERIALS[name] = mat


def create_armature():
    arm_data = bpy.data.armatures.new("frieza_salute_armature")
    armature = bpy.data.objects.new("frieza_salute_rig", arm_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        edit_bone = arm_data.edit_bones.new(name)
        edit_bone.head = head
        edit_bone.tail = tail
        edit_bone.roll = 0
        if parent:
            edit_bone.parent = arm_data.edit_bones[parent]
            edit_bone.use_connect = False
        return edit_bone

    bone("root", (0, 0, 0.0), (0, 0, 0.45))
    bone("hips", (0, 0, 0.65), (0, 0, 1.2), "root")
    bone("spine", (0, 0, 1.15), (0, 0, 2.05), "hips")
    bone("head", (0, 0, 2.0), (0, 0, 2.8), "spine")

    for side, sign in (("L", -1), ("R", 1)):
        bone(f"upper_arm.{side}", (sign * 0.34, 0, 1.86), (sign * 0.82, 0, 1.52), "spine")
        bone(f"forearm.{side}", (sign * 0.82, 0, 1.52), (sign * 1.0, 0, 1.08), f"upper_arm.{side}")
        bone(f"hand.{side}", (sign * 1.0, 0, 1.08), (sign * 1.08, 0, 0.9), f"forearm.{side}")
        bone(f"thigh.{side}", (sign * 0.22, 0, 0.98), (sign * 0.28, 0, 0.52), "hips")
        bone(f"shin.{side}", (sign * 0.28, 0, 0.52), (sign * 0.26, 0, 0.13), f"thigh.{side}")
        bone(f"foot.{side}", (sign * 0.26, 0, 0.13), (sign * 0.26, -0.36, 0.08), f"shin.{side}")

    bone("tail_a", (0, 0.16, 0.86), (0, 0.72, 0.64), "hips")
    bone("tail_b", (0, 0.72, 0.64), (0, 1.18, 0.72), "tail_a")
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def align_between_points(obj, start, end):
    start_v = Vector(start)
    end_v = Vector(end)
    mid = (start_v + end_v) * 0.5
    direction = end_v - start_v
    obj.location = mid
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return direction.length


def add_object(obj, material_name, bone_name, armature):
    if material_name:
        obj.data.materials.append(MATERIALS[material_name])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    group = obj.vertex_groups.new(name=bone_name)
    group.add(range(len(obj.data.vertices)), 1.0, "ADD")
    modifier = obj.modifiers.new("rigid_bone_binding", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    obj.rotation_mode = "XYZ"
    CREATED_OBJECTS[obj.name] = obj
    obj.select_set(False)
    return obj


def add_sphere(name, location, scale, material, bone_name, armature, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return add_object(obj, material, bone_name, armature)


def add_cylinder(name, start, end, radius, material, bone_name, armature, vertices=16):
    length = max((Vector(end) - Vector(start)).length, 0.001)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=length, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    align_between_points(obj, start, end)
    return add_object(obj, material, bone_name, armature)


def add_cone(name, location, radius1, depth, material, bone_name, armature, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=18, radius1=radius1, radius2=0.0, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return add_object(obj, material, bone_name, armature)


def build_character(armature):
    add_sphere("hips_shell", (0, 0, 1.03), (0.42, 0.28, 0.32), "white_shell", "hips", armature)
    add_sphere("hips_front_armor", (0, -0.255, 1.08), (0.33, 0.065, 0.22), "purple_armor", "hips", armature, segments=20, rings=8)
    add_sphere("hips_back_armor", (0, 0.255, 1.08), (0.33, 0.065, 0.22), "purple_armor", "hips", armature, segments=20, rings=8)
    add_sphere("chest_shell", (0, -0.02, 1.58), (0.46, 0.32, 0.58), "white_shell", "spine", armature)
    add_sphere("chest_plate", (0, -0.30, 1.72), (0.34, 0.075, 0.42), "purple_armor", "spine", armature, segments=24, rings=10)
    add_sphere("back_plate", (0, 0.30, 1.72), (0.34, 0.075, 0.42), "purple_armor", "spine", armature, segments=24, rings=10)
    add_sphere("abdomen_plate", (0, -0.31, 1.38), (0.25, 0.055, 0.18), "deep_purple", "spine", armature, segments=18, rings=8)
    add_sphere("back_spine_plate", (0, 0.31, 1.38), (0.25, 0.055, 0.18), "deep_purple", "spine", armature, segments=18, rings=8)
    add_sphere("waist_band", (0, 0, 1.24), (0.5, 0.32, 0.055), "black_joint", "spine", armature, segments=24, rings=6)
    add_sphere("neck_joint", (0, 0, 2.04), (0.2, 0.18, 0.18), "black_joint", "head", armature, segments=16, rings=8)
    add_sphere("head_shell", (0, -0.03, 2.42), (0.42, 0.34, 0.42), "white_shell", "head", armature)
    add_sphere("head_dome", (0, -0.25, 2.56), (0.31, 0.075, 0.22), "purple_armor", "head", armature, segments=24, rings=8)
    add_sphere("head_dome_back", (0, 0.25, 2.56), (0.31, 0.075, 0.22), "purple_armor", "head", armature, segments=24, rings=8)
    add_sphere("face_plate", (0, -0.36, 2.36), (0.28, 0.04, 0.17), "deep_purple", "head", armature, segments=16, rings=8)
    add_sphere("eye.L", (-0.11, -0.395, 2.43), (0.045, 0.018, 0.028), "red_eye", "head", armature, segments=12, rings=6)
    add_sphere("eye.R", (0.11, -0.395, 2.43), (0.045, 0.018, 0.028), "red_eye", "head", armature, segments=12, rings=6)
    add_cylinder("brow.L", (-0.18, -0.397, 2.50), (-0.05, -0.397, 2.47), 0.012, "black_joint", "head", armature, vertices=8)
    add_cylinder("brow.R", (0.05, -0.397, 2.47), (0.18, -0.397, 2.50), 0.012, "black_joint", "head", armature, vertices=8)
    add_cylinder("mouth_line", (-0.075, -0.398, 2.28), (0.075, -0.398, 2.28), 0.01, "pink_energy", "head", armature, vertices=8)

    add_cone("left_horn", (-0.33, -0.04, 2.67), 0.075, 0.36, "white_shell", "head", armature, rotation=(0, math.radians(70), 0))
    add_cone("right_horn", (0.33, -0.04, 2.67), 0.075, 0.36, "white_shell", "head", armature, rotation=(0, math.radians(-70), 0))
    add_sphere("left_horn_tip", (-0.45, -0.04, 2.77), (0.045, 0.045, 0.045), "purple_armor", "head", armature, segments=10, rings=6)
    add_sphere("right_horn_tip", (0.45, -0.04, 2.77), (0.045, 0.045, 0.045), "purple_armor", "head", armature, segments=10, rings=6)

    for side, sign in (("L", -1), ("R", 1)):
        add_sphere(f"shoulder_joint.{side}", (sign * 0.43, 0, 1.84), (0.18, 0.18, 0.18), "purple_armor", f"upper_arm.{side}", armature, segments=16, rings=8)
        add_sphere(f"shoulder_cap_front.{side}", (sign * 0.43, -0.15, 1.84), (0.19, 0.075, 0.15), "deep_purple", f"upper_arm.{side}", armature, segments=14, rings=8)
        add_sphere(f"shoulder_cap_back.{side}", (sign * 0.43, 0.15, 1.84), (0.19, 0.075, 0.15), "deep_purple", f"upper_arm.{side}", armature, segments=14, rings=8)
        add_cylinder(f"upper_arm.{side}", (sign * 0.43, 0, 1.78), (sign * 0.78, -0.03, 1.5), 0.095, "white_shell", f"upper_arm.{side}", armature)
        add_sphere(f"elbow_joint.{side}", (sign * 0.82, -0.03, 1.48), (0.12, 0.12, 0.12), "purple_armor", f"forearm.{side}", armature, segments=14, rings=8)
        add_sphere(f"elbow_band.{side}", (sign * 0.82, -0.03, 1.48), (0.135, 0.075, 0.045), "black_joint", f"forearm.{side}", armature, segments=14, rings=6)
        add_cylinder(f"forearm.{side}", (sign * 0.82, -0.03, 1.46), (sign * 0.98, -0.04, 1.1), 0.085, "white_shell", f"forearm.{side}", armature)
        add_sphere(f"hand.{side}", (sign * 1.02, -0.04, 1.0), (0.12, 0.09, 0.13), "purple_armor", f"hand.{side}", armature, segments=14, rings=8)
        add_sphere(f"wrist_band.{side}", (sign * 0.96, -0.04, 1.12), (0.1, 0.075, 0.055), "black_joint", f"forearm.{side}", armature, segments=14, rings=6)

        add_sphere(f"thigh_joint.{side}", (sign * 0.24, 0, 0.92), (0.15, 0.14, 0.15), "purple_armor", f"thigh.{side}", armature, segments=14, rings=8)
        add_cylinder(f"thigh.{side}", (sign * 0.24, 0, 0.9), (sign * 0.28, -0.02, 0.54), 0.11, "white_shell", f"thigh.{side}", armature)
        add_sphere(f"knee_joint.{side}", (sign * 0.28, -0.02, 0.5), (0.13, 0.12, 0.13), "purple_armor", f"shin.{side}", armature, segments=14, rings=8)
        add_sphere(f"knee_front_plate.{side}", (sign * 0.28, -0.12, 0.5), (0.13, 0.05, 0.13), "deep_purple", f"shin.{side}", armature, segments=14, rings=8)
        add_sphere(f"knee_back_plate.{side}", (sign * 0.28, 0.1, 0.5), (0.13, 0.055, 0.13), "deep_purple", f"shin.{side}", armature, segments=14, rings=8)
        add_cylinder(f"shin.{side}", (sign * 0.28, -0.02, 0.48), (sign * 0.26, -0.05, 0.16), 0.095, "white_shell", f"shin.{side}", armature)
        add_sphere(f"ankle_band.{side}", (sign * 0.26, -0.05, 0.18), (0.1, 0.08, 0.045), "black_joint", f"shin.{side}", armature, segments=14, rings=6)
        add_sphere(f"foot.{side}", (sign * 0.27, -0.2, 0.09), (0.16, 0.24, 0.08), "white_shell", f"foot.{side}", armature, segments=14, rings=8)
        add_sphere(f"foot_cap.{side}", (sign * 0.27, -0.37, 0.11), (0.13, 0.08, 0.055), "purple_armor", f"foot.{side}", armature, segments=14, rings=6)

    add_cylinder("tail_a", (0, 0.25, 0.84), (0, 0.75, 0.62), 0.105, "white_shell", "tail_a", armature)
    add_sphere("tail_band", (0, 0.72, 0.63), (0.095, 0.095, 0.055), "black_joint", "tail_a", armature, segments=14, rings=6)
    add_cylinder("tail_b", (0, 0.75, 0.62), (0, 1.12, 0.74), 0.085, "white_shell", "tail_b", armature)
    add_sphere("tail_tip", (0, 1.18, 0.75), (0.13, 0.13, 0.13), "purple_armor", "tail_b", armature, segments=14, rings=8)

    add_sphere("salute_glow", (1.02, -0.1, 2.34), (0.1, 0.035, 0.1), "gold_salute", "hand.R", armature, segments=16, rings=8)
    add_sphere("knee_glow", (0.32, -0.18, 0.14), (0.22, 0.035, 0.22), "glow_blue", "shin.R", armature, segments=20, rings=6)

    add_cylinder("salute_display_upper_arm.R", (0.42, -0.38, 1.86), (0.4, -0.42, 2.24), 0.09, "gold_salute", "upper_arm.R", armature, vertices=16)
    add_cylinder("salute_display_forearm.R", (0.4, -0.42, 2.24), (0.22, -0.44, 2.56), 0.08, "gold_salute", "forearm.R", armature, vertices=16)
    add_sphere("salute_display_hand.R", (0.2, -0.45, 2.66), (0.16, 0.1, 0.16), "purple_armor", "hand.R", armature, segments=16, rings=8)


def reset_pose(armature):
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.location = (0, 0, 0)
        pose_bone.rotation_euler = (0, 0, 0)
        pose_bone.scale = (1, 1, 1)

    for obj in CREATED_OBJECTS.values():
        if obj.name.startswith("salute_display_"):
            obj.scale = (0.001, 0.001, 0.001)


def set_pose(armature, pose):
    reset_pose(armature)
    root = armature.pose.bones.get("root")
    hips = armature.pose.bones.get("hips")
    spine = armature.pose.bones.get("spine")
    head = armature.pose.bones.get("head")
    thigh_r = armature.pose.bones.get("thigh.R")
    shin_r = armature.pose.bones.get("shin.R")
    foot_r = armature.pose.bones.get("foot.R")
    thigh_l = armature.pose.bones.get("thigh.L")
    shin_l = armature.pose.bones.get("shin.L")
    upper_r = armature.pose.bones.get("upper_arm.R")
    fore_r = armature.pose.bones.get("forearm.R")
    hand_r = armature.pose.bones.get("hand.R")
    tail_a = armature.pose.bones.get("tail_a")
    tail_b = armature.pose.bones.get("tail_b")

    if root:
        root.location = (0, -0.06 * pose, -0.14 * pose)
    if hips:
        hips.rotation_euler = (math.radians(-18 * pose), math.radians(0), math.radians(-6 * pose))
    if spine:
        spine.rotation_euler = (math.radians(18 * pose), 0, math.radians(5 * pose))
    if head:
        head.rotation_euler = (math.radians(-10 * pose), 0, math.radians(3 * pose))
    if thigh_r:
        thigh_r.rotation_euler = (math.radians(76 * pose), math.radians(-12 * pose), math.radians(-10 * pose))
    if shin_r:
        shin_r.rotation_euler = (math.radians(-112 * pose), 0, math.radians(10 * pose))
    if foot_r:
        foot_r.rotation_euler = (math.radians(32 * pose), 0, 0)
    if thigh_l:
        thigh_l.rotation_euler = (math.radians(-18 * pose), 0, math.radians(5 * pose))
    if shin_l:
        shin_l.rotation_euler = (math.radians(18 * pose), 0, 0)
    if upper_r:
        upper_r.rotation_euler = (math.radians(-118 * pose), math.radians(12 * pose), math.radians(-34 * pose))
    if fore_r:
        fore_r.rotation_euler = (math.radians(88 * pose), math.radians(-12 * pose), math.radians(28 * pose))
    if hand_r:
        hand_r.rotation_euler = (math.radians(20 * pose), 0, math.radians(-14 * pose))
    if tail_a:
        tail_a.rotation_euler = (math.radians(22 * pose), 0, math.radians(-8 * pose))
    if tail_b:
        tail_b.rotation_euler = (math.radians(-28 * pose), 0, math.radians(10 * pose))

    for obj in CREATED_OBJECTS.values():
        if obj.name.startswith("salute_display_"):
            visible_scale = max(0.001, pose)
            obj.scale = (visible_scale, visible_scale, visible_scale)


def keyframe_pose(armature, frame, pose):
    bpy.context.scene.frame_set(frame)
    set_pose(armature, pose)
    for pose_bone in armature.pose.bones:
        pose_bone.keyframe_insert(data_path="location", frame=frame)
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)
        pose_bone.keyframe_insert(data_path="scale", frame=frame)
    for obj in CREATED_OBJECTS.values():
        if obj.name.startswith("salute_display_"):
            obj.keyframe_insert(data_path="scale", frame=frame)


def animate_armature(armature):
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 120
    bpy.context.scene.render.fps = 24

    for frame, pose in [
        (1, 0.0),
        (18, 0.0),
        (42, 1.0),
        (76, 1.0),
        (104, 0.0),
        (120, 0.0),
    ]:
        keyframe_pose(armature, frame, pose)

    bpy.ops.object.mode_set(mode="OBJECT")
    action = armature.animation_data.action if armature.animation_data else None
    if action:
        action.name = "KneelSaluteLoop"
        if hasattr(action, "fcurves"):
            for fcurve in action.fcurves:
                for point in fcurve.keyframe_points:
                    point.interpolation = "SINE" if hasattr(point, "interpolation") else "BEZIER"


def export_model(armature):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    armature.select_set(True)
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_PATH),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_frame_range=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_materials="EXPORT",
        export_yup=True,
    )


def main():
    clear_scene()
    create_materials()
    armature = create_armature()
    build_character(armature)
    animate_armature(armature)
    export_model(armature)


if __name__ == "__main__":
    main()
