export function createContainedRuntimeEnvironment({
  auth,
  binRoot,
  buildkitSocket,
  home,
  runcBinary,
  runcStateRoot,
  runtimeWrapperRoot,
  tmp,
  xdgCache,
  xdgConfig,
  xdgData,
  xdgRuntime,
}) {
  return {
    HOME: home,
    TMPDIR: tmp,
    XDG_CACHE_HOME: xdgCache,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_DATA_HOME: xdgData,
    XDG_RUNTIME_DIR: xdgRuntime,
    DOCKER_CONFIG: auth,
    BUILDKIT_HOST: `unix://${buildkitSocket}`,
    COUNTERLAB_RUNC_BINARY: runcBinary,
    COUNTERLAB_RUNC_STATE_ROOT: runcStateRoot,
    PATH: `${runtimeWrapperRoot}:${binRoot}:/usr/bin:/bin`,
  };
}
