import { create_float_buffer, create_index_buffer } from './context.js';
import { math } from './math.js';
import { zero_vector, unit_vector } from '../misc/defaults.js';
import { materials } from '../materials/materials.js';
import { hex_to_vec } from '../misc/utils.js';

class Entity {
  constructor(options = {}) {
    const look_at = math.vec3.from_values(0, -1, 1.85);
    const up = math.vec3.from_values(0, 0, 1);

    this.position = options.position || zero_vector.slice();
    this.rotation = options.rotation || zero_vector.slice();
    this.scale = options.scale || unit_vector.slice();
    this.origin = options.origin || zero_vector.slice();

    this.material = options.material;

    if (this.material) {
      this.color_vec = [];
      this.color_opacity = 1.0;
      this.color = options.color || '#ffffff';
    }

    this.forward = [];
    this.up = [];
    this.right = [];

    this.entities = [];

    this.keyboard_controlled = false;

    this.move_speed = 3.5;
    this.rotate_speed = 1.5;

    this.indices = this.indices || options.indices;
    this.vertices = this.vertices || options.vertices;
    this.normals = this.normals || options.normals;

    this.material_desc = this.material && new materials[this.material];
    this.program = this.material_desc && this.material_desc.program;

    this.skip = false;

    this.dir = {};

    this.dir_desc = {
      87: 'f',
      65: 'l',
      68: 'r',
      83: 'b',
      81: 'u',
      69: 'd',
      38: 'r_u',
      40: 'r_d',
      39: 'r_r',
      37: 'r_l'
    };

    math.vec3.subtract(this.forward, look_at, this.position);
    math.vec3.cross(this.right, this.forward, up);
    math.vec3.cross(this.up, this.right, this.forward);

    math.vec3.normalize(this.forward, this.forward);
    math.vec3.normalize(this.right, this.right);
    math.vec3.normalize(this.up, this.up);

    if (this.vertices && this.indices && this.normals) {
      this.create_buffers();
    }
  }

  set color(hex) {
    hex = hex || '#ffffff';
    this.color_vec = [...hex_to_vec(hex), this.color_opacity];
  }

  create_buffers() {
    this.buffers = {
      vertices: create_float_buffer(this.vertices),
      indices: create_index_buffer(this.indices),
      qty: this.indices.length,
      normals: create_float_buffer(this.normals)
    }
  }

  add(entity) {
    entity.parent = this;
    this.entities.push(entity);
  }

  get_matrix(out) {
    const look_at_vect = [];
    math.vec3.add(look_at_vect, this.position, this.forward);
    math.mat4.look_at(out, this.position, look_at_vect, this.up);
    return out;
  }

  rotate_rl(rad) {
    const rightMatrix = math.mat4.create();
    math.mat4.rotate(rightMatrix, rightMatrix, rad, this.up);
    math.vec3.transform_mat4(this.forward, this.forward, rightMatrix);
    this.realign();
  }

  rotate_ud(rad) {
    const rightMatrix = math.mat4.create();
    math.mat4.rotate(rightMatrix, rightMatrix, rad, this.right);
    math.vec3.transform_mat4(this.forward, this.forward, rightMatrix);
    this.realign();
  }

  realign() {
    math.vec3.cross(this.right, this.forward, this.up);
    math.vec3.cross(this.up, this.right, this.forward);

    math.vec3.normalize(this.forward, this.forward);
    math.vec3.normalize(this.right, this.right);
    math.vec3.normalize(this.up, this.up);
  }

  move_f(dist) {
    math.vec3.scale_and_add(this.position, this.position, this.forward, dist);
  }

  move_r(dist) {
    math.vec3.scale_and_add(this.position, this.position, this.right, dist);
  }

  move_u(dist) {
    math.vec3.scale_and_add(this.position, this.position, this.up, dist);
  }

  do_step(tick_length) {
    if (this.dir.f && !this.dir.b) {
      this.move_f(tick_length / 1000 * this.move_speed);
    }

    if (this.dir.b && !this.dir.f) {
      this.move_f(-tick_length / 1000 * this.move_speed);
    }

    if (this.dir.r && !this.dir.l) {
      this.move_r(tick_length / 1000 * this.move_speed);
    }

    if (this.dir.l && !this.dir.r) {
      this.move_r(-tick_length / 1000 * this.move_speed);
    }

    if (this.dir.u && !this.dir.d) {
      this.move_u(tick_length / 1000 * this.move_speed);
    }

    if (this.dir.d && !this.dir.u) {
      this.move_u(-tick_length / 1000 * this.move_speed);
    }

    if (this.dir.r_r && !this.dir.r_l) {
      this.rotate_rl(-tick_length / 1000 * this.rotate_speed);
    }

    if (this.dir.r_l && !this.dir.r_r) {
      this.rotate_rl(tick_length / 1000 * this.rotate_speed);
    }

    if (this.dir.r_u && !this.dir.r_d) {
      this.rotate_ud(tick_length / 1000 * this.rotate_speed);
    }

    if (this.dir.r_d && !this.dir.r_u) {
      this.rotate_ud(-tick_length / 1000 * this.rotate_speed);
    }
  }

  update(tick_length) {
    if (this.skip) {
      return;
    }

    if (this.keyboard_controlled && this.game) {
      Object.keys(this.dir_desc).forEach((key) => {
        if (this.dir_desc[key]) {
          this.dir[this.dir_desc[key]] = this.game.keys[key] || false;
        }
      });
      this.do_step(tick_length);
    }

    if (!this.material && !this.entities.length) {
      return;
    }

    const model_view_matrix_from = (this.parent && this.parent.model_view_matrix)
      || math.mat4.create();
    const model_view_matrix = math.mat4.identity(math.mat4.create());
    math.mat4.translate(model_view_matrix, model_view_matrix_from, this.position);

    const rev_origin = this.origin.map((e) => -e);

    math.mat4.translate(model_view_matrix, model_view_matrix, rev_origin);

    math.mat4.rotate(
      model_view_matrix,
      model_view_matrix,
      math.vec3.angle([1, 0, 0], this.right),
      [1, 1, 1]
    );
    math.mat4.rotate(
      model_view_matrix,
      model_view_matrix,
      math.vec3.angle([0, 1, 0], this.forward),
      [1, 1, 1]
    );
    math.mat4.rotate(
      model_view_matrix,
      model_view_matrix,
      math.vec3.angle([0, 0, 1], this.up),
      [1, 1, 1]
    );

    // math.mat4.rotate(model_view_matrix, model_view_matrix, this.rotation[0], [1, 0, 0]);
    // math.mat4.rotate(model_view_matrix, model_view_matrix, this.rotation[1], [0, 1, 0]);
    // math.mat4.rotate(model_view_matrix, model_view_matrix, this.rotation[2], [0, 0, 1]);

    math.mat4.translate(model_view_matrix, model_view_matrix, this.origin);
    math.mat4.scale(model_view_matrix, model_view_matrix, this.scale);

    this.model_view_matrix = model_view_matrix;

    this.entities.forEach((entity) => {
      entity.update();
    });

  }

  render(ticks) {
    !this.skip && this.material && this.material_desc.render(this);
    !this.skip && this.entities.forEach((entity) => {
      entity.render(ticks);
    });
  }

  // generate_shadow_map() {
  //   this.material_desc.generate_shadow_map && this.material_desc.generate_shadow_map(this);
  // }
}

export { Entity }
