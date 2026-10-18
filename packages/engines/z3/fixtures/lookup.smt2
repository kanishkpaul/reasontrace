; An uninterpreted function: f(x) is 3 and x is above 1.
(declare-fun f (Int) Int)
(declare-const x Int)
(assert (= (f x) 3))
(assert (> x 1))
(check-sat)
