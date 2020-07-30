# Python module for OpenSCAD-style 2-D object building.
# vim: set fileencoding=utf-8 :

# Terminology
# Coordinate: a real number.
# Point: two Coordinates.
# Line: connection of 2 Points.
# Segment: series of connected Lines.
# Polygon: closed Segment, so start and end points are equal. If they go clockwise, they are solids, otherwise they are holes.
# Part: collection of Polygons and segments.

# The hard parts (in terms of code) of this module are:
# computing the union of two (or more) polygons.
# computing the offset of a polygon.
# computing the hull of a polygon.

# API:
# Vn = Vector(dx, dy)
#	dx = V0[0]
#	dy = V0[1]
#	Vn = V1 + V0
#	Vn = V1 - V0
#	Vn = -V0
#	Vn = V0 * c
#	Vn = V0 / c
#	Vn = V1.rotate(c)	# in degrees ccw.
#	d = V0.direction()	# in degrees ccw, 0 is along x axis.
# Pn = Point(x, y)
#	x = P0[0]
#	y = P0[1]
#	Vn = P1 - P0
#	Pn = P0 + Vn
#	Pn = P0.rotate(c, P = (0, 0))	# in degrees ccw
# Ln = Line(P0, P1)
#	P0 = L0[0]
#	P1 = L0[1]
#	Ln = -L0	(swap points)
#	Ln = L0.rotate(c, P = (0, 0))	# in degrees ccw
#	S0, S1 = L0 * L1	# intersection
# Sn = Segment(P0, P1, ...)	# Lines can be used instead of points.
#	Ln = S0[n]
#	l = len(S0)	# number of Lines.
#	Sn = -S0	(inverse)
#	Sn = S0 + V0	(translate)
#	Sn = S0.scale(c, P = (0, 0))
#	Sn = S0.rotate(c, P = (0, 0))	# in degrees ccw
#	S0.is_hole: True for holes, False for solids, None for non-polygons.
# Tn = Part(S0, S1, ...)
#	Sn = T0[n]
#	- Tn = T0 + T1	(union)
#	Tn = T0 - T1	(difference)
#	Tn = T0 * T1	(intersection)
#	Tn = -T0	(inverse)
#	Tn = T0 + V0	(translate)
#	Tn = T1.scale(c, P = (0, 0))
#	Tn = T0.rotate(c, P = (0, 0))	# in degrees ccw
#	- Tn = T0.offset(c)
#	- Tn = T0.hull()

import sys
import math
import fhs

fhs.module_info('polygon', 'manipulate 2-D object using Python', '0.1', 'Bas Wijnen <wijnen@debian.org>')
fhs.module_option('polygon', 'style', 'draw style for opbjects', default = 'fill:green;stroke:black')

# Internally all computations are done with ints. The ints represent fixed
# point numbers. They should be divided by unit to get the number they
# represent.
unit = 1 << 10

def dbg(*a):
	#print(*a) #, file = sys.stderr)
	pass

class Vector:
	def __init__(self, dx, dy):
		self.d = (round(dx), round(dy))
	def __getitem__(self, n):
		return self.d[n]
	def __sub__(self, other):
		if isinstance(other, Vector):
			return Vector(*(sd - od for sd, od in zip(self.d, other.d)))
		raise TypeError('can only subtract Vectors from Vectors')
	def __isub__(self, other):
		if isinstance(other, Vector):
			self.d = tuple(sd - od for sd, od in zip(self.d, other.d))
			return self
		raise TypeError('can only subtract Vectors from Vectors')
	def __neg__(self):
		return Vector(*(sd for sd in self.d[::-1]))
	def __add__(self, other):
		if isinstance(other, Vector):
			return Vector(*(sd + od for sd, od in zip(self.d, other.d)))
		raise TypeError('can only add Vectors to Vectors')
	def __iadd__(self, other):
		if isinstance(other, Vector):
			self.d = (sd + od for sd, od in zip(self.d, other.d))
			return self
		raise TypeError('can only add Vectors to Vectors')
	def __mul__(self, other):
		if isinstance(other, (int, float)):
			return Vector(*(sd * other for sd in self.d))
		if isinstance(other, Vector):
			# dot product.
			return sum(sd * od for sd, od in zip(self.d, other.d))
		raise TypeError('can only multiply Vectors by numbers or Vectors')
	def __imul__(self, other):
		if isinstance(other, (int, float)):
			self.d = tuple(sd * other for sd in self.d)
			return self
		raise TypeError('can only multiply Vectors by numbers')
	def length(self):
		return (self * self) ** .5
	def __truediv__(self, other):
		if isinstance(other, (int, float)):
			return Vector(*(sd / other for sd in self.d))
		raise TypeError('can only divide Vectors by numbers')
	def __itruediv__(self, other):
		if isinstance(other, (int, float)):
			self.d = tuple(sd / other for sd in self.d)
			return self
		raise TypeError('can only divide Vectors by numbers')
	def rotate(self, angle):
		c = math.cos(math.radians(angle))
		s = math.sin(math.radians(angle))
		return Vector(c * self.d[0] - s * self.d[1], c * self.d[1] + s * self.d[0])
	def direction(self):
		return math.degrees(math.atan2(self.d[1], self.d[0]))
	def __eq__(self, other):
		return self.d == other.d
	def __ne__(self, other):
		return self.d != other.d
	def __repr__(self):
		return '«%.1f, %.1f»' % (self.d[0] / unit, self.d[1] / unit)
def V(dx, dy):
	return Vector(dx * unit, dy * unit)

class Point:
	def __init__(self, x, y):
		self.c = (round(x), round(y))
	def __repr__(self):
		return '(%.1f,%.1f)' % (self.c[0] / unit, self.c[1] / unit)
	def __getitem__(self, n):
		return self.c[n] / unit
	def __sub__(self, other):
		if isinstance(other, Point):
			return Vector(*(sc - oc for sc, oc in zip(self.c, other.c)))
		if isinstance(other, Vector):
			return Point(*(sc - od for sc, od in zip(self.c, other.d)))
		raise TypeError('can only subtract a Point or Vector from a Point')
	def __add__(self, other):
		if isinstance(other, Vector):
			return Point(*(sc + od for sc, od in zip(self.c, other.d)))
		raise TypeError('can only add a Vector to a Point')
	def rotate(self, angle, P):
		return P + (self - P).rotate(angle)
	def __eq__(self, other):
		return self.c == other.c
	def __ne__(self, other):
		return self.c != other.c
	def __hash__(self):
		return hash(self.c)
def P(x, y):
	return Point(x * unit, y * unit)

origin = Point(0, 0)

class Line:
	def __init__(self, P0, P1):
		assert all(isinstance(P, Point) for P in (P0, P1))
		self.p = (P0, P1)
	def __repr__(self):
		return '[%s -> %s]' % self.p
	def __getitem__(self, n):
		return self.p[n]
	def __neg__(self):
		return Line(*(p for p in self.p[::-1]))
	def rotate(self, angle, P = origin):
		return Line(*(p.rotate(P, angle) for p in self.p))
	def length(self):
		return (self.p[1] - self.p[0]).length()
	def __mul__(self, other):
		# Find intersection(s) of two Lines.
		# Return (Segment1, Segment2)
		# The segments follow the same path as the lines, but are broken at the intersection(s).
		# There may be two intersections if the lines are overlapping.
		if not isinstance(other, Line):
			raise TypeError('can only intersect Line with Line')
		dist_on = [None, None]
		dist_from = [None, None]
		for i in range(2):
			dist_on[i], dist_from[i] = self.project(other[i])
		dbg('dist on', dist_on, 'from', dist_from)
		if (dist_from[0] > 0 and dist_from[1] > 0) or (dist_from[0] < 0 and dist_from[1] < 0):
			# Both points on same side: no intersection.
			dbg('no intersection')
			return Segment(self), Segment(other)
		if dist_from[0] == 0 and dist_from[1] == 0:
			# Lines are on the same line and may be overlapping.
			dbg('on line')
			if (dist_on[0] <= 0 and dist_on[1] <= 0) or (dist_on[0] >= 1 and dist_on[1] >= 1):
				# Not intersecting.
				dbg('disjoint')
				return Segment(self), Segment(other)
			P, Q = (0, 1) if dist_on[0] < dist_on[1] else (1, 0)
			inv = lambda x: x if P == 0 else x[::-1]
			if dist_on[P] < 0:
				# P,A, ?
				dbg('P,A,?')
				if dist_on[Q] < 1:
					# P,A,Q,B
					# A,Q,B; P,A,Q
					dbg('# P,A,Q,B # A,Q,B; P,A,Q')
					return Segment(self.p[0], other.p[P], self.p[1]), Segment(*inv((other.p[P], self.p[0], other.p[Q])))
				if dist_on[Q] == 1:
					# P,A,BQ
					# A,B; P,A,Q
					dbg('# P,A,BQ # A,B; P,A,Q')
					return Segment(self), Segment(*inv((other.p[P], self.p[0], other.p[Q])))
				# P,A,B,Q
				# A,B; P,A,B,Q
				dbg('# P,A,B,Q # A,B; P,A,B,Q')
				return Segment(self), Segment(*inv((other.p[P], self.p[0], self.p[1], other.p[Q])))
			if dist_on[P] == 0:
				#PA, ?
				dbg('#PA, ?')
				if dist_on[Q] < 1:
					# PA,Q,B
					# A,Q,B; P,Q
					dbg('# PA,Q,B # A,Q,B; P,Q')
					return Segment(self.p[0], other.p[Q], self.p[1]), Segment(other)
				if dist_on[Q] == 1:
					# PA,QB
					dbg('# PA,QB # A,B; P,Q')
					return Segment(self), Segment(other)
				# PA,B,Q
				# A,B; P,B,Q
				dbg('# PA,B,Q # A,B; P,B,Q')
				return Segment(self), Segment(*inv((other.p[P], self.p[1], other.p[Q])))
			# A,P, ?
			dbg('# A,P, ?')
			if dist_on[Q] < 1:
				# A,P,Q,B
				# A,P,Q,B; P,Q
				dbg('# A,P,Q,B # A,P,Q,B; P,Q')
				return Segment(self.p[0], other.p[P], other.p[Q], self.p[1]), Segment(other)
			if dist_on[Q] == 1:
				# A,P,BQ
				# A,P,B; P,Q
				dbg('# A,P,BQ # A,P,B; P,Q')
				return Segment(self.p[0], other.p[P], self.p[1]), Segment(other)
			# A,P,B,Q
			# A,P,B; P,B,Q
			dbg('# A,P,B,Q # A,P,B; P,B,Q')
			return Segment(self.p[0], other.p[P], self.p[1]), Segment(*inv((other.p[P], self.p[1], other.p[Q])))
		if dist_from[0] == 0:
			# First Point is on the other line.
			dbg('# First Point is on the other line.')
			if 0 < dist_on[0] < 1:
				return Segment(self.p[0], other.p[0], self.p[1]), Segment(other)
			return Segment(self), Segment(other)
		if dist_from[1] == 0:
			# Second Point is on the other line.
			dbg('# Second Point is on the other line.')
			if 0 < dist_on[1] < 1:
				return Segment(self.p[0], other.p[1], self.p[1]), Segment(other)
			return Segment(self), Segment(other)
		# Points are on either side of the line.
		dbg('# Points are on either side of the line.')
		onX = dist_on[0] + (dist_on[1] - dist_on[0]) / (dist_from[1] - dist_from[0]) * -dist_from[0]
		if not 0 <= onX <= 1:
			# No intersection.
			dbg('# No intersection.')
			return Segment(self), Segment(other)
		for edge in (0, 1):
			if onX == edge:
				return Segment(self), Segment(other.p[0], self.p[edge], other.p[1])
		X = self.p[0] + (self.p[1] - self.p[0]) * onX
		dbg('intersection at', X)
		return Segment(self.p[0], X, self.p[1]), Segment(other.p[0], X, other.p[1])
	def project(self, P):
		# Project a Point onto a line.
		# Return (distance on line, distance to line)
		# distance to line is positive when it's outside a solid (right of line going in positive y direction).
		if not isinstance(P, Point):
			raise TypeError('can only project Point onto Line')
		dbg('projecting', P, 'on', self)
		# First check if self is zero length, because it would break things.
		line_dir = self.p[1] - self.p[0]
		mylen2 = line_dir * line_dir
		if mylen2 == 0:
			return 0, (P - self.p[0]).length()
		# Special cases when points are equal, to make sure there are no rounding errors.
		if P == self.p[0]:
			return 0, 0
		elif P == self.p[1]:
			return 1, 0
		# Similarly when the line is horizontal or vertical.
		if self.p[0][0] == self.p[1][0]:
			# Vertical line.
			return (P[1] - self.p[0][1]) / (self.p[1][1] - self.p[0][1]), P[0] - self.p[0][0]
		elif self.p[0][1] == self.p[1][1]:
			# Horizontal line.
			return (P[0] - self.p[0][0]) / (self.p[1][0] - self.p[0][0]), P[1] - self.p[0][1]
		v = P - self.p[0]
		vlen = v.length()
		dist_on = line_dir * v / mylen2
		perp = Vector(v.d[1], -v.d[0])
		dist_from = line_dir * perp / (mylen2 ** .5)
		return dist_on, dist_from

class Segment:
	def __init__(self, first, *args, **kwargs):
		self.p = []
		if isinstance(first, Point):
			self.p.append(first)
		elif isinstance(first, Line):
			self.p.append(first[0])
			self.p.append(first[1])
		else:
			raise TypeError('Segments can only be constructed from Lines or Points')
		for a in args:
			if isinstance(a, Point):
				self.p.append(a)
			elif isinstance(a, Line):
				if a[0] != self.p[-1]:
					raise ValueError('Lines in a segment must connect to each other')
				self.p.append(a[1])
			else:
				raise TypeError('Segments can only be constructed from Lines or Points')
		self.is_hole = self.compute_hole()
		if 'hole' in kwargs:
			hole = kwargs.pop('hole')
			if hole is None:
				self.is_hole = None
			elif not isinstance(hole, bool):
				raise ValueError('hole argument must be a bool')
			elif hole != self.is_hole:
				self.p.reverse()
				self.is_hole = hole
	def __repr__(self):
		return 'Segment: ' + '->'.join(str(p) for p in self.p)
	def __len__(self):
		return len(self.p) - 1
	def __getitem__(self, n):
		return Line(self.p[n], self.p[n + 1])
	def __neg__(self):
		return Segment(*(p for p in self.p[::-1]))
	def __add__(self, other):
		if isinstance(other, Vector):
			return Segment(*(p + other for p in self.p))
		raise TypeError('Can only add Vectors to Segments')
	def __sub__(self, other):
		if isinstance(other, Vector):
			return Segment(*(p - other for p in self.p))
		raise TypeError('Can only subtract Vectors from Segments')
	def scale(self, c, P = origin):
		return Segment(*(P + (p - P) * c for p in self.p))
	def rotate(self, angle, P = origin):
		return Segment(*(P + (p - P).rotate(angle) for p in self.p))
	def mirror(self):
		return Segment(*(Point(-p.c[0], p.c[1]) for p in self.p[::-1]))
	def compute_hole(self):
		if self.p[0] != self.p[-1] or len(self.p) < 4:
			return None
		# Rotate points so leftmost Point is at start and end.
		idx = min(enumerate(self.p), key = lambda p: p[1].c)[0]
		self.p = self.p[idx:-1] + self.p[:idx + 1]
		v1 = self.p[1] - self.p[0]
		v2 = self.p[-2] - self.p[-1]
		return v1.direction() < v2.direction()
	def contains(self, P):
		if not isinstance(P, Point):
			raise TypeError('Segment can only check if a Point is contained in it')
		if P in self.p:
			return True
		total = 0
		for l in self:
			a = (l[0] - P).direction()
			b = (l[1] - P).direction()
			change = (b - a + 180) % 360 - 180
			total += change
		assert 179 < (total + 180) % 360 < 181
		num = round(total / 360)
		assert num in (-1, 0, 1)
		return num != 0
	def path(self, offset):
		ret = 'M' + '%f,%f' % ((self.p[0].c[0] + offset[0]) / unit, -(self.p[0].c[1] + offset[1]) / unit)
		point = self.p[0]
		for i, p in enumerate(self.p[1:]):
			if p == point:
				dbg('duplicate point in path', p)
			elif p == self.p[0]:
				# end-2, because we skip the first item.
				assert i == len(self.p) - 2
				ret += 'Z'
			elif p.c[0] == point.c[0]:
				ret += 'V%f' % (-(p.c[1] + offset[1]) / unit)
			elif p.c[1] == point.c[1]:
				ret += 'H%f' % ((p.c[0] + offset[0]) / unit)
			else:
				ret += 'L%f,%f' % ((p.c[0] + offset[0]) / unit, -(p.c[1] + offset[1]) / unit)
			point = p
		return ret
	def offset(self, c):
		if self.is_hole is None:
			return Segment(*self.p)
		result = []
		last_point = self.p[-2]
		for p, point in enumerate(self.p[:-1]):
			v_to = point - last_point
			v_from = self.p[p + 1] - point
			v_to_length = v_to.length()
			v_from_length = v_from.length()
			if v_to_length > v_from_length:
				v_from *= v_to_length / v_from_length
			elif v_from_length > v_to_length:
				v_to *= v_from_length / v_to_length
			v_offset = v_from - v_to
			factor = c / v_offset.length()
			dir_change = (v_from.direction() - v_to.direction()) % 360
			alpha = (180 - dir_change) / 2
			sinalpha = math.sin(math.radians(alpha))
			if sinalpha != 0:
				factor /= sinalpha
			result.append(point + v_offset * factor)
			last_point = point
		result.append(Point(*result[0].c))
		return Segment(*result)

class Part:
	def __init__(self, *segments):
		if any(not isinstance(s, Segment) for s in segments):
			raise TypeError('Can only make a Part from Segments')
		self.segment = segments
	def __repr__(self):
		return 'Part:' + ''.join('\n\t%s' % s for s in self.segment)
	def __getitem__(self, n):
		return self.segment[n]
	def __add__(self, other):
		if isinstance(other, Vector):
			# translate
			return Part(*(s + other for s in self.segment))
		if not isinstance(other, Part):
			raise TypeError('Parts can only be added to other Parts or Vectors')
		return self.combine(other, 1)
	def __sub__(self, other):
		if isinstance(other, Vector):
			# translate
			return Part(*(s - other for s in self.segment))
		if not isinstance(other, Part):
			raise TypeError('Only Parts and Vectors can be subtracted from Parts')
		return self + -other
	def __mul__(self, other):
		if not isinstance(other, Part):
			raise TypeError('Parts can only be intersected with other Parts')
		return self.combine(other, 2)
	def __neg__(self):
		return Part(*(-s for s in self.segment))
	def scale(self, c, P = origin):
		return Part(*(s.scale(c, P) for s in self.segment))
	def rotate(self, angle, P = origin):
		return Part(*(s.rotate(angle, P) for s in self.segment))
	def mirror(self):
		return Part(*(s.mirror() for s in self.segment))
	def bbox(self, internal = False):
		bb = [None] * 4
		for s in self.segment:
			for point in s.p:
				x, y = point.c
				if bb[0] is None or bb[0] > x:
					bb[0] = x
				if bb[1] is None or bb[1] > y:
					bb[1] = y
				if bb[2] is None or bb[2] < x:
					bb[2] = x
				if bb[3] is None or bb[3] < y:
					bb[3] = y
		if internal:
			return bb
		else:
			return [c / unit for c in bb]
	def align(self, target):
		bb = self.bbox(True)
		if target[0][0] == 't':
			y = bb[3]
		elif target[0][0] == 'c':
			y = 0
		elif target[0][0] == 'b':
			y = bb[1]
		else:
			raise ValueError('Invalid vertical alignment %s' % target[0])
		if target[1][0] == 'l':
			x = bb[0]
		elif target[1][0] == 'c':
			x = 0
		elif target[1][0] == 'r':
			x = bb[2]
		else:
			raise ValueError('Invalid horizontal alignment %s' % target[0])
		cc = (bb[2] - bb[0], bb[3] - bb[1])
		return self - Vector(x - cc[0], y - cc[0])
	def combine(self, other, min_stack = 1):
		if not isinstance(other, Part):
			raise TypeError('Parts can only be combined with other Parts')
		# Put all lines in a list.
		lines = []
		for o in (self, other):
			for s in o.segment:
				if s.is_hole is None:
					continue
				for l in range(len(s)):
					lines.append(s[l])
		# Break up intersecting lines.
		l1 = 0
		while l1 < len(lines) - 1:
			l2 = l1 + 1
			while l2 < len(lines):
				s1, s2 = lines[l1] * lines[l2]
				for s, l in zip((s1, s2), (l1, l2)):
					if len(s) == 1:
						continue
					lines[l] = s[0]
					for ll in range(1, len(s)):
						lines.append(s[ll])
				l2 += 1
			l1 += 1
		# Sort the list.
		lines.sort(key = lambda l: (l[0].c, l[1].c) if l[0].c < l[1].c else (l[1].c, l[0].c))
		# Remove duplicates
		l = 0
		while l < len(lines) - 1:
			if tuple(lines[l]) == (lines[l + 1][1], lines[l + 1][0]):
				lines.pop(l)
				lines.pop(l)
				continue
			l += 1
		dbg('all lines:', lines)
		# Generate intersection dict.
		intersection = {}
		for l in lines:
			for i in range(2):
				if l[i] not in intersection:
					intersection[l[i]] = []
				intersection[l[i]].append(l)
		# Create polygon tree.
		points = list(intersection.keys())
		points.sort(key = lambda p: p.c)
		result = []
		stack = []
		while len(points) > 0:
			p = points[0]
			if len(intersection[p]) == 0:
				points.pop(0)
				continue
			candidates = [(i, l) for i, l in enumerate(intersection[p])]
			candidates.sort(key = lambda c: ((c[1][1] - p) + (c[1][0] - p)).direction())
			firstidx, first = candidates[-1]
			hole = first.p[1] == p
			a, b = (1, 0) if hole else (0, 1)
			polygon = [first.p[a], first.p[b]]
			intersection[p].pop(firstidx)
			intersection[polygon[-1]].remove(first)
			while polygon[0] != polygon[-1]:
				p = polygon[-1]
				indir = (polygon[-2] - polygon[-1]).direction()
				candidates = [(i, l) for i, l in enumerate(intersection[p])]
				candidates.sort(key = lambda c: (((c[1][1] - p) + (c[1][0] - p)).direction() - indir) % 360)
				t = len(candidates) - 1
				depth = 0
				while True:
					if candidates[t][1].p[a] != p:
						depth += 1
					elif depth > 0:
						depth -= 1
					else:
						break
					t -= 1
				index, line = candidates[t]
				polygon.append(line.p[b])
				intersection[p].pop(index)
				intersection[line.p[b]].remove(line)
			if hole:
				polygon = polygon[::-1]
			# Put holes inside containers.
			while len(stack) > 0:
				if stack[-1]['polygon'].p[0] == polygon[0]:
					# If first points match, it is contained due to the sorting order.
					dbg('first points match; inside')
					break
				if polygon[0] not in stack[-1]['polygon'].p:
					dbg('first point not inside')
					if not stack[-1]['polygon'].contains(polygon[0]):
						# Polygon is not contained, so it's a new branch.
						dbg('poly outside')
						stack.pop()
						continue
					else:
						dbg('poly inside')
						break
				# The first point is shared with some other point in the polygon. Check for containment.
				idx = stack[-1]['polygon'].p.index(polygon[0])
				dbg('first poly-point shared with non-first point', idx)
				# Because it is not the first point, there is a point before this point, as well as after.
				sd1 = (stack[-1]['polygon'].p[idx - 1] - stack[-1]['polygon'].p[idx]).direction()
				sd2 = (stack[-1]['polygon'].p[idx + 1] - stack[-1]['polygon'].p[idx]).direction()
				pd = (polygon[1] - polygon[0]).direction()
				inside = (pd - sd1) % 360 < (sd2 - sd1) % 360
				if stack[-1]['hole']:
					inside = not inside
				dbg('dirs:', sd1, sd2, pd, 'inside:', inside)
				if not inside:
					stack.pop()
				else:
					break
			frame = {'polygon': Segment(*polygon), 'contains': [], 'hole': hole}
			if len(stack) > 0:
				stack[-1]['contains'].append(frame)
			else:
				result.append(frame)
			stack.append(frame)
		# Remove holes in holes and solids in solids.
		new_result = []
		stack = [{'group': result, 'current': 0, 'depth': 0}]
		while len(stack) > 0:
			frame = stack[-1]
			group = frame['group']
			current = frame['current']
			depth = frame['depth']
			if current >= len(group):
				depth -= (-1 if branch['hole'] else 1)
				stack.pop()
				continue
			frame['current'] += 1
			branch = group[current]
			depth += (-1 if branch['hole'] else 1)
			if (depth == min_stack - 1 and branch['hole']) or (depth == min_stack and not branch['hole']):
				# Add frame to result.
				dbg('add branch', branch['polygon'], 'hole', branch['hole'], 'depth', depth)
				new_result.append(branch['polygon'])
			else:
				dbg('skip branch', branch['polygon'], 'hole', branch['hole'], 'depth', depth)
			stack.append({'group': branch['contains'], 'current': 0, 'depth': depth})
		# Handle non-polygon segments.
		open = [s for s in self.segment if s.is_hole is None] + [s for s in other.segment if s.is_hole is None]
		# Create a new Part from the lines.
		new_result += open
		return Part(*new_result)
	def offset(self, c):
		return Part(*(s.offset(c) for s in self.segment)) + Part()
	def hull(self):
		# TODO.
		pass

debug_show = []
def show(part):
	debug_show.append(Part(*(s for s in part.segment)))
	return part

def svg(*parts, **kwargs):
	if 'sep' in kwargs:
		sep = kwargs['sep']
	else:
		sep = 5
	sep *= unit
	total_bb = [None] * 4
	offset = []
	for p in parts:
		bb = p.bbox(True)
		if total_bb[0] is None:
			total_bb = bb
			offset.append((0, 0))
			continue
		if bb[3] - bb[1] > total_bb[3] - total_bb[1]:
			total_bb[3] = bb[3] - bb[1] + total_bb[1]
		# Add the new bounding box to the current total and set offset.
		offset.append((total_bb[2] + sep - bb[0], total_bb[1] - bb[1]))
		total_bb[2] += sep + (bb[2] - bb[0])
	w, h = ((total_bb[2] - total_bb[0] + 2 * sep) / unit, (total_bb[3] - total_bb[1] + 2 * sep) / unit)
	ret = '''\
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width='%fmm' height='%fmm' viewBox='%f %f %f %f' xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink">
''' % (w, h, (total_bb[0] - sep) / unit, (-total_bb[3] - sep) / unit, w, h)
	s = fhs.module_get_config('polygon')['style']
	style = '' if len(s) == 0 else " style='" + s + "'"
	for p, o in zip(parts, offset):
		current_path = ''
		for s in p.segment:
			if len(current_path) > 0 and s.is_hole is False:
				ret += '<path d="' + current_path + '"' + style + '/>\n'
				current_path = ''
			current_path += s.path(o)
		if len(current_path) > 0:
			ret += '<path d="' + current_path + '"' + style + '/>\n'
			current_path = ''
	if len(debug_show) > 0:
		ret += "<g style='fill:none;stroke:red'>\n"
		for p in debug_show:
			for s in p.segment:
				ret += '<path d="' + s.path((0, 0)) + '"/>\n'
		ret += "</g>\n"
	ret += '</svg>\n'
	if 'file' in kwargs:
		with open(kwargs['file'], 'w') as f:
			f.write(ret)
	return ret

def polygon(*points):
	return Part(Segment(*(P(*p) for p in points)))

def rect(w, h):
	w /= 2
	h /= 2

	return polygon((-w, -h), (-w, h), (w, h), (w, -h), (-w, -h))

def circle(r, fn = 50):
	def mkp(a):
		angle = a * 2 * math.pi / fn
		return (r * math.cos(angle), r * math.sin(angle))
	# Use -a, because a ccw polygon is a hole.
	p = [mkp(-a) for a in range(fn)]
	p.append(p[0])
	return polygon(*p)

def cut(A, B):
	return Part(Segment(A, B))
