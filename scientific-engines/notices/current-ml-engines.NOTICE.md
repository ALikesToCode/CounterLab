# CounterLab current ML engine notices

This notice covers the scientific-engine local candidate
`sha256:67682290a02e8b94e4522511242a3196f1a4f116eb187e22274abece2740b7a2`.
It is not labelled as the Cloudflare production image until deployment and
production smoke finish.
It does not replace the complete installed license texts preserved under
`scientific-engines/licenses/`.

| Component                  | Observed version | Installed metadata or runtime declaration                                       | Preserved license                                     |
| -------------------------- | ---------------: | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| CPython                    |          3.12.13 | Runtime version and image `PYTHON_VERSION`                                      | `cpython-3.12.13/LICENSE.txt`                         |
| NumPy                      |            2.4.6 | `License-Expression: BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`        | `numpy-2.4.6/LICENSE.txt`                             |
| pandas                     |            2.3.3 | Installed metadata contains a combined license body but no `License-Expression` | `pandas-2.3.3/LICENSE`                                |
| scikit-learn               |            1.9.0 | `License-Expression: BSD-3-Clause`                                              | `scikit-learn-1.9.0/COPYING`                          |
| CounterLab fixed ML kernel |            0.1.0 | `License-Expression: MIT`; retained reproducible wheel                          | `counterlab-kernel-0.1.0/LICENSE`                     |

The pandas repository copy has one terminal line-feed added by the patch
transport. Its manifest records both the exact installed byte hash and the
normalized repository-copy hash. Third-party wheels are hash-locked for
CPython 3.12 on Linux amd64. The CounterLab kernel wheel is retained in the
image, and two clean builder runs produced the same SHA-256.
