FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7

ARG COUNTERLAB_SOURCE_COMMIT=unbound
ARG COUNTERLAB_SOURCE_TREE_SHA256=unbound

LABEL org.opencontainers.image.title="CounterLab generated-adapter runner" \
    org.opencontainers.image.description="Minimal runtime for declarative CounterLab adapters" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.revision="${COUNTERLAB_SOURCE_COMMIT}" \
    org.opencontainers.image.source="https://github.com/ALikesToCode/CounterLab" \
    io.counterlab.source-tree-sha256="${COUNTERLAB_SOURCE_TREE_SHA256}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONHASHSEED=0 \
    PYTHONPATH=/opt/counterlab

RUN mkdir -p /opt/counterlab /workspace /fixtures /output /tmp \
    && chown 65532:65532 /opt /opt/counterlab /workspace /fixtures /output /tmp \
    && chmod 0555 /opt/counterlab /workspace /fixtures \
    && chmod 0700 /output /tmp

COPY --chown=65532:65532 --chmod=0444 concept-packs/leakage/public/counterlab_sdk.py /opt/counterlab/counterlab_sdk.py
COPY --chown=65532:65532 --chmod=0555 services/runner/image/harness.py /opt/counterlab/harness.py

USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["python", "/opt/counterlab/harness.py"]
