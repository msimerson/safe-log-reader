
# 1.0.5 - 2016-10-19

    - correct a race condition in bookmark saving (#17)

# 1.0.4 - 2016-07-20

    - ignore file watch notifications for other files in same dir (#13)
    - avoid infinite recursion if file path has no / characters

# 1.0.3 - 2016-07-03

    - in watchRename, don't try to close null watcher
    - add nodejs 6 testing
    - drop nodejs 0.10 testing

# 1.0.2 - 2016-01-07

    - retry bookmark save once

# 1.0.1 - 2015-11-18

    - pass end-of-batch arguments properly
