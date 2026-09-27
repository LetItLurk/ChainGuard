from __future__ import annotations


class ChainGuardError(Exception):
    """Base error. `public_message` is safe to return to clients."""

    status_code = 500

    def __init__(self, public_message: str) -> None:
        super().__init__(public_message)
        self.public_message = public_message


class InvalidInputError(ChainGuardError):
    status_code = 400


class PayloadTooLargeError(ChainGuardError):
    status_code = 413


class UnsupportedRepositoryError(ChainGuardError):
    status_code = 422


class NotFoundError(ChainGuardError):
    status_code = 404


class IngestionError(ChainGuardError):
    status_code = 502
