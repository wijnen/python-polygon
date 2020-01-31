// Module for handling polygons

// Data structures:

// A polyline is stored as an array:
//   [[x, y], [x, y], [x, y], ...]
// A polygon is a polyline with the last point equal to the first point.
// A shape is an array of polylines. solids are clockwise polygons (normal into surface),
//   holes are counterclockwise polygons (normal out of surface).

// Interface:
//   invert(shape) -> shape: invert all polygon directions.
//   merge(poly1, poly2) -> shape: merge two polygons; return array of new polygons, or null if there are no intersections.
//   unite(shape) -> shape: merge overlapping polygons in shape.
//   intersect(shape) -> shape: merge overlapping holes in shape.
//   offset(shape, distance) -> shape: offset all polygons of shape towards hole (for positive distance); non-polygons are not changed. Used for compensating for line cut width.
//   bbox(shape) -> [l, w]: compute bounding box of shape.
//   translate(shape, [x, y]) -> shape: translate shape.
//   svg([shape, ...])-> string: encode shapes as svg (each shape is a separate path).
//   svgdata([shape, ...]) -> string: as above, then encode result as data url.

var svg_sep = 5;	// Space between objects when building svg.
var svg_lw = 1;		// Line width in svg.

function invert(shape) {
	var ret = [];
	for (var s = 0; s < shape.length; ++s) {
		poly = shape[s];
		ret.push([]);
		for (var c = poly.length - 1; c >= 0; --c)
			ret[s].push(poly[c]);
	}
	return ret;
}

function diff(A, B) {
	return [B[0] - A[0], B[1] - A[1]];
}

function inner(A, B) {
	return A[0] * B[0] + A[1] * B[1];
}

function len(A) {
	return Math.sqrt(inner(A, A));
}

function mul(A, d) {
	return [A[0] * d, A[1] * d];
}

function div(A, d) {
	return [A[0] / d, A[1] / d];
}

function normalize(A) {
	return div(A, len(A));
}

// This function computes the projection of the target point on the line through origin and online.
// Returns [distance on line, distance from line].
// Distance from line is positive if it is on the right when looking along the line, negative if it is on the left.
function project(origin, online, target) {
	var line = normalize(diff(online, origin));
	var v = diff(target, origin);
	var dist_on = inner(line, v);
	//var l = len(v);
	//var factor = inner(line, v) / l;
	//var dist = l * factor;

	// Find distance from line, by projecting on perpendicular line.
	var perp = [line[1], -line[0]];	// This is already a unit vector.
	var dist_from = inner(perp, v);
	return [dist_on, dist_from];
}

function copy_array(A) {
	var ret = [];
	for (var i = 0; i < A.length; ++i)
		ret.push(A[i]);
	return ret;
}

function merge(poly1, poly2) {
	// Only handle polygons, not open polylines.
	if (poly1[0] != poly1[poly1.length - 1] || poly2[0] != poly2[poly2.length - 1])
		return null;
	// Use segments p..p+1
	// Break every polygon into segments.
	// Remove inner segments.
	// At first intersection, rotate polygon so the intersection is the first point.
	// Start breaking it up at subsequent intersections.
	var p1 = copy_array(poly1);	// Current (possibly rotated) polygon.
	var p2 = copy_array(poly2);
	// All intersections that were found. If empty, polygons are not yet rotated.
	// Each element is {'pos': [x, y], 'p1': [segments from p1], 'p2': [segments from p2]}.
	var intersection = [];
	for (var p1 = 0; p1 < poly1.length - 1; ++p1) {
		for (var p2 = 0; p2 = poly2.length - 1; ++p2) {
			var dA = project(poly1[p1], poly1[p1 + 1], poly2[p2]);
			var dB = project(poly1[p1], poly1[p1 + 1], poly2[p2 + 1]);
			if (((dA[1] > 0) && (dB[1] > 0)) || ((dA[1] < 0) && (dB[1] < 0))) {
				// Both points are on the same side of the line; ignore.
				continue;
			}
			// TODO: find other side, break it up, connect pieces.
			// Problem: if there are multiple overlaps, it needs to be broken into multiple separate loops.
		}
	}
}

function unite(shape) {
	var ret = [shape[0]];
	for (var s = 1; s < shape.length; ++s) {
		var new_poly = shape[s];
		for (var r = 0; r < ret.length; ++r) {
			n = merge(ret[r], new_poly);
			if (n === null) {
				ret.push(new_poly);
				continue;
			}
			ret.splice(r, 1, n[0]);
			for (var nn = 1; nn < n.length; ++nn)
				ret.push(n[nn]);
		}
	}
	// TODO: remove polygons contained in other polygons. (hole in hole, not solid in hole.)
	return shape;
}

function intersect(shape) {
	return invert(unite(invert(shape)));
}

function offset(shape, distance) {
	// TODO
	return shape;
}

function bbox(shape) {
	var ret = [NaN, NaN, NaN, NaN];
	for (var p = 0; p < shape.length; ++p) {
		var poly = shape[p];
		for (var c = 0; c < poly.length; ++c) {
			if (!(poly[c][0] >= ret[0]))
				ret[0] = poly[c][0];
			if (!(poly[c][1] >= ret[1]))
				ret[1] = poly[c][1];
			if (!(poly[c][0] <= ret[2]))
				ret[2] = poly[c][0];
			if (!(poly[c][0] <= ret[3]))
				ret[3] = poly[c][0];
		}
	}
	return ret;
}

function translate(shape, xy) {
	var ret = [];
	for (var p = 0; p < shape.length; ++p) {
		var poly = shape[p];
		ret.push([]);
		for (var c = 0; c < poly.length; ++c)
			ret[p].push([poly[c][0] + xy[0], poly[c][1] + xy[1]]);
	}
	return ret;
}

function svg() {
	var bb = [-svg_sep, 0];
	var x_pos = [0];
	for (var a = 0; a < arguments.length; ++a) {
		var a_bbox = bbox(arguments[a]);
		x_pos.push(a_bbox[2]);
		bb[0] += a_bbox[2] + svg_sep;
		if (bb[1] < a_bbox[3])
			bb[1] = a_bbox[3];
	}
	var data = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="' + bb[0] + 'mm" height="' + bb[1] + 'mm" viewBox="0 0 ' + bb[0] + ' ' + bb[1] + '" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g fill="none" stroke="#ff0000" style="stroke-width:' + svg_lw + '">\n'
	for (var a = 0; a < arguments.length; ++a) {
		var shape = arguments[a];
		data += '<path d="';
		for (var p = 0; p < shape.length; ++p) {
			var poly = shape[p];
			data += 'M' + (x_pos[a] + poly[0][0]) + ',' + poly[0][1];
			for (var c = 1; c < poly.length - 1; ++c)
				data += 'l' + poly[c][0] + ',' + poly[c][1];
			if (poly[0] == poly[poly.length - 1])
				data += 'z';
			else
				data += 'l' + poly[poly.length - 1][0] + ',' + poly[poly.length - 1][1];
		}
		data += '"/>\n'
	}
	data += '</g>\n</svg>\n';
	return data;
}

function svgdata() {
	return 'data:image/svg,' + encodeURIComponent(svg(arguments));
}
