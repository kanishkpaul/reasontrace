; x is above 2 and below 1. The third bound, x below 5, plays no part.
(declare-const x Int)
(assert (> x 2))
(assert (< x 1))
(assert (< x 5))
(check-sat)
