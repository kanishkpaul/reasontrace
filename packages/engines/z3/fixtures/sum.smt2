; Two integers that sum to 10, the first larger.
(declare-const x Int)
(declare-const y Int)
(assert (> x y))
(assert (= (+ x y) 10))
(check-sat)
