// The current path. Drawing functions add to this variable.
var current;

// All paths use relative coordinates. The current pen position is stored to allow moving to absolute positions.
// The pen position is set to [0, 0] at the start of each object.
var pen = [0, 0];

// To move the pen, this variable is set. It will only be written to the path when an actual move is made.
var target = [0, 0];

// Offset of current origin in absolute coordinates.
var offset = [0, 0];

// Constants that are given by the user.
var halfcut;	// Half width of cut line.
var tabsize;	// Requested width of tabs. (Actual width is usually slightly smaller.)
var plate;	// Thickness of wood plate.

// Constants for internal use.
var lengths = [['h', 1, 0, -1], ['v', 1, 1, 0], ['h', -1, 0, 1], ['v', -1, -1, 0]];	// per dir: [hv], sign, offsetx, offsety

function compute_num_teeth(length) { // {{{
	var num = Math.ceil(length / tabsize);
	if (!(num & 1))
		num += 1;
	if (num < 3)
		num = 3;
	return num;
} // }}}

function up(dir) { // Return direction for moving up a tooth. {{{
	return (dir + 3) % 4;
} // }}}
function opposite(dir) { // Return direction for moving over a tooth (negative direction). {{{
	return (dir + 2) % 4;
} // }}}
function down(dir) { // Return direction for moving up a tooth. {{{
	return (dir + 1) % 4;
} // }}}

function finish_move() { // Internal function to apply a move that was prepared. {{{
	if (target[0] != pen[0] || target[1] != pen[1]) {
		current += 'm' + (target[0] - pen[0]) + ',' + (target[1] - pen[1]);
		pen[0] = target[0];
		pen[1] = target[1];
	}
} // }}}

function finish_path() { // Internal function. Return and clear current path. {{{
	var ret = current;
	current = 'M0,0';
	return ret;
} // }}}

function move(len, dir) { // Move the pen. {{{
	var l = lengths[dir];
	var d = l[0] == 'h' ? 0 : 1;
	target[d] += len * l[1];
} // }}}
function line(len, dir, start, end) { // Draw a line, adjusting for cut width. {{{
	// start and end are true (the default) for convex, false for concave, null for no longitudinal offset.
	var l = lengths[dir];
	var convert = {null: 0, false: -1, true: 1, undefined: 1};
	start = convert[start] * halfcut;
	end = convert[end] * halfcut;
	var dist = (len + start + end) * l[1];
	move(-start, dir);
	move(halfcut, up(dir));
	finish_move();
	current += l[0] + dist;
	var d = l[0] == 'h' ? 0 : 1;
	pen[d] += dist;
	target[d] += dist;
	move(-end, dir);
	move(-halfcut, up(dir));
} // }}}

// Draw lines. Starting coordinate is always at the corner of the rectange excluding the teeth. {{{
function line_straight(len, dir, start, end) { // Straight line, no connectors. {{{
	line(len, dir, start, end);
} // }}}
function line_h(len, dir) { // Connector line, teeth start low. {{{
	var num = compute_num_teeth(len);
	var ts = len / num;
	line(ts, dir, true, false);
	for (var i = 0; i < (num - 4) / 2; ++i)	{ // Subtract 1/2 more to avoid rounding error problems.
		line(plate, up(dir), false, true);
		line(ts + 2 * halfcut, dir, true, true);
		line(plate, down(dir), true, false);
		line(ts - 2 * halfcut, dir, false, false);
	}
	line(plate, up(dir), false, true);
	line(ts + 2 * halfcut, dir, true, true);
	line(plate, down(dir), true, false);
	line(ts - 2 * halfcut, dir, false, true);
} // }}}
function line_v(len, dir) { // Connector line, teeth start high. {{{
	var num = compute_num_teeth(len);
	var ts = len / num;
	line(plate, up(dir), true, true);
	line(ts, dir, true, true);
	for (var i = 0; i < (num - 2) / 2; ++i)	{ // Subtract 1/2 more to avoid rounding error problems.
		line(plate, down(dir), true, false);
		line(ts, dir, false, false);
		line(plate, up(dir), false, true);
		line(ts, dir, true, true);
	}
	line(plate, down(dir), true, true);
} // }}}
function line_base(len, dir) { // Connector line, teeth start high, include corners. {{{
	var num = compute_num_teeth(len);
	var ts = len / num;
	move(-plate, dir);
	move(-plate, down(dir));
	line(ts + plate, dir, true, true);
	for (var i = 0; i < (num - 4) / 2; ++i)	{ // Subtract 1/2 more to avoid rounding error problems.
		line(plate, down(dir), true, false);
		line(ts, dir, false, false);
		line(plate, up(dir), false, true);
		line(ts, dir, true, true);
	}
	line(plate, down(dir), true, false);
	line(ts, dir, false, false);
	line(plate, up(dir), false, true);
	line(ts + plate, dir, true, true);
	move(-plate, dir);
	move(plate, down(dir));
} // }}}
// }}}

function make_svg(paths, w, h) { // {{{
	var cutwidth = halfcut < .05 ? .1 : 2 * halfcut;
	ret = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="' + w + 'mm" height="' + h + 'mm" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g fill="none" stroke="#ff0000" style="stroke-width:' + cutwidth + '">\n';
	for (var p = 0; p < paths.length; ++p)
		ret += '<path d="' + paths[p] + '"/>\n';
	ret += '</g>\n</svg>';
	return ret;
} // }}}

function make_rect(bbox, l, w, splits, type, top, right, bottom, left) { // {{{
	// Make a rectangle
	// type in ['base', 'h', 'v', 'hm', 'vm'] for tab alignment; [xy] is at edge, [xy]m is divider.
	// trbl true or undefined for tabs, false for line, null for skip.

	for (var c = 0; c < 2; ++c)
		offset[c] += target[c];
	target = [0, 0];
	pen = [0, 0];
	current = 'M' + offset[0] + ',' + offset[1];
	var program = [top, right, bottom, left];
	var size = [l, w, l, w];
	for (var dir = 0; dir < program.length; ++dir) {
		if (program[dir] === false) {
			line_straight(size[dir], dir)
			continue;
		}
		if (program[i] === null) {
			move(size[dir], dir)
			continue;
		}
		if (type == 'base') {
			line_base(size[dir], dir);
			continue;
		}
		if (type[0] == 'h' || (dir & 1) == 0) {
			line_h(size[dir], dir);
			continue;
		}
		else {
			line_v(size[dir], dir);
			continue;
		}
	}
	if (type == 'base') {
		// Add dividers for base.
	}
	else {
		if (type[1] == 'm') {
			// Add dividers on divider.
			var part, post;
			if (type[0] == 'h') {
				part = function() {
					line(h / 2 + plate, 1);
					line(plate, 0);
					line(h / 2 + plate, 3);
				};
				post = function() {};
			}
			else {
				part = function() {
					move(plate, 0);
					line(w / 2 + plate, 3);
					line(plate, 2);
					line(w / 2 + plate, 1);
					move(plate, 0);
				};
				move(w + plate, 1);
				post = function() { move(w + plate, 3); };
			}
			move(plate / 2, 0);
			for (var i = 0; i < splits.length; ++i) {
				move(splits[i], 0);
				part();
			}
			post();
		}
		else {
			// Add dividers for edge.
		}
	}
	var dx = l + (type == 'base' ? 3 : 2) * plate + 4 * halfcut + 5
	bbox[0] += dx;
	var dy = w + (type == 'base' ? 4 : 3) * plate + 4 * halfcut
	if (dy > bbox[1])
		bbox[1] = dy;
	if (type == 'base')
		move(plate + 2 * halfcut, 1);
	move(l + 6 * halfcut + 3 * plate, 0)
	var ret = finish_path();
	pen = target;
	return ret;
} // }}}

function parseNumbers(input) { // {{{
	var strParts = input.split(';');
	var parts = [];
	var total = -plate;
	for (var i = 0; i < strParts.length; ++i) {
		parts.push(Number(strParts[i]));
		total += parts[i] + plate;
	}
	return [total, parts];
} // }}}

function create() { // {{{
	tabsize = Number(document.getElementById('tabsize').value);
	plate = Number(document.getElementById('depth').value);
	halfcut = Number(document.getElementById('cut').value) / 2;
	var l = parseNumbers(document.getElementById('length').value);
	var w = parseNumbers(document.getElementById('width').value);
	var h = Number(document.getElementById('height').value);
	var with_top = document.getElementById('top').checked;
	var bbox = [plate, 4 * halfcut + plate];
	target = [bbox[0], bbox[1]];
	var paths = [];
	target = [halfcut * 2 + plate, halfcut * 2 + plate];
	paths.push(make_rect(bbox, l[0], w[0], [w[1], l[1]], 'base'));
	if (with_top) {
		paths.push(make_rect(bbox, l[0], h, l[1], 'hm'));
	}
	else {
		for (var n = 0; n < 2; ++n) {
			path += make_rect(bbox, w[0], h, w[1], 'h', true, true, false, true);
			path += make_rect(bbox, l[0], h, l[1], 'v', true, true, false, true);
		}
	}
	var svg = make_svg(paths, bbox[0], bbox[1]);
	document.getElementById('link').href = 'data:image/svg,' + encodeURIComponent(svg);
	document.getElementById('preview').innerHTML = svg;
} // }}}

// vim: set foldmethod=marker :
