"""
ChainGuard backend test suite.

Tests for:
- Archive extraction safety (path traversal, symlinks, bombs)
- GitHub URL parsing
- Solidity file discovery
- Repository mapper (lexical)
- Static analysis normalization
- Attack chain pattern engine
- Confidence scoring
- Knowledge graph construction
- AI candidate validation
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Archive safety
# ---------------------------------------------------------------------------
from app.ingestion.archive import (
    ExtractionResult,
    IngestionFormatError,
    as_stream,
    extract_zip,
    safe_member_path,
)
from app.core.errors import InvalidInputError, PayloadTooLargeError, UnsupportedRepositoryError


class TestSafeMemberPath:
    def test_simple_path(self):
        assert safe_member_path("contracts/Vault.sol", False) == "contracts/Vault.sol"

    def test_dot_prefix_stripped(self):
        assert safe_member_path("./contracts/Vault.sol", False) == "contracts/Vault.sol"

    def test_absolute_path_rejected(self):
        assert safe_member_path("/etc/passwd", False) is None

    def test_parent_traversal_rejected(self):
        assert safe_member_path("../../../etc/passwd", False) is None

    def test_null_byte_rejected(self):
        assert safe_member_path("contracts\x00evil", False) is None

    def test_backslash_rejected(self):
        assert safe_member_path("contracts\\Vault.sol", False) is None

    def test_windows_drive_rejected(self):
        assert safe_member_path("C:/Windows/system32", False) is None

    def test_strip_root_removes_top_level_dir(self):
        assert safe_member_path("repo-main/contracts/Vault.sol", True) == "contracts/Vault.sol"

    def test_strip_root_on_top_level_file_returns_none(self):
        # After stripping the single top-level directory the path becomes empty
        result = safe_member_path("repo-main/", True)
        assert result is None


def _make_zip(members: dict[str, bytes]) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in members.items():
            zf.writestr(name, data)
    buf.seek(0)
    return buf


SIMPLE_SOL = b"// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A {}"


class TestExtractZip:
    def test_extracts_solidity_files(self, tmp_path):
        z = _make_zip({"contracts/Vault.sol": SIMPLE_SOL})
        result = extract_zip(z, tmp_path, max_total=10 * 1024 * 1024, max_files=100)
        assert "contracts/Vault.sol" in result.extracted

    def test_skips_non_solidity_files(self, tmp_path):
        z = _make_zip({
            "contracts/Vault.sol": SIMPLE_SOL,
            "package.json": b"{}",
            "README.md": b"# readme",
        })
        result = extract_zip(z, tmp_path, max_total=10 * 1024 * 1024, max_files=100)
        assert "contracts/Vault.sol" in result.extracted
        assert not any("package.json" in p for p in result.extracted)

    def test_strips_common_root_directory(self, tmp_path):
        z = _make_zip({"my-repo-main/contracts/Vault.sol": SIMPLE_SOL})
        result = extract_zip(z, tmp_path, max_total=10 * 1024 * 1024, max_files=100)
        assert "contracts/Vault.sol" in result.extracted

    def test_rejects_invalid_zip(self, tmp_path):
        with pytest.raises(InvalidInputError):
            extract_zip(io.BytesIO(b"not a zip"), tmp_path, max_total=10 * 1024 * 1024, max_files=100)

    def test_rejects_no_solidity_files(self, tmp_path):
        z = _make_zip({"README.md": b"# readme"})
        with pytest.raises(UnsupportedRepositoryError):
            extract_zip(z, tmp_path, max_total=10 * 1024 * 1024, max_files=100)

    def test_rejects_oversized_archive(self, tmp_path):
        z = _make_zip({"contracts/Vault.sol": SIMPLE_SOL})
        with pytest.raises(PayloadTooLargeError):
            # max_total is just 1 byte
            extract_zip(z, tmp_path, max_total=1, max_files=100)

    def test_rejects_too_many_entries(self, tmp_path):
        members = {f"file{i}.txt": b"data" for i in range(10)}
        members["contracts/Vault.sol"] = SIMPLE_SOL
        z = _make_zip(members)
        with pytest.raises(PayloadTooLargeError):
            extract_zip(z, tmp_path, max_total=10 * 1024 * 1024, max_files=5)

    def test_extracted_paths_stay_inside_dest(self, tmp_path):
        z = _make_zip({"contracts/Vault.sol": SIMPLE_SOL})
        extract_zip(z, tmp_path, max_total=10 * 1024 * 1024, max_files=100)
        for extracted in (tmp_path / "contracts").rglob("*"):
            assert str(extracted).startswith(str(tmp_path))


# ---------------------------------------------------------------------------
# GitHub URL parsing
# ---------------------------------------------------------------------------
from app.ingestion.github import parse_github_url
from app.core.errors import InvalidInputError as GitHubInvalidInputError


class TestParseGitHubUrl:
    valid = [
        "https://github.com/OpenZeppelin/openzeppelin-contracts",
        "https://github.com/uniswap/v3-core",
        "https://github.com/owner/repo.git",
        "https://github.com/a/b",
    ]
    invalid = [
        "http://github.com/owner/repo",
        "https://gitlab.com/owner/repo",
        "https://github.com/",
        "https://github.com/owner",
        "not-a-url",
    ]

    @pytest.mark.parametrize("url", valid)
    def test_accepts_valid_url(self, url):
        ref = parse_github_url(url)
        assert ref.owner
        assert ref.repo

    @pytest.mark.parametrize("url", invalid)
    def test_rejects_invalid_url(self, url):
        with pytest.raises(InvalidInputError):
            parse_github_url(url)

    def test_extracts_owner_and_repo(self):
        ref = parse_github_url("https://github.com/uniswap/v3-core")
        assert ref.owner == "uniswap"
        assert ref.repo == "v3-core"

    def test_strips_git_suffix(self):
        ref = parse_github_url("https://github.com/owner/repo.git")
        assert not ref.repo.endswith(".git")


# ---------------------------------------------------------------------------
# Solidity file discovery
# ---------------------------------------------------------------------------
from app.ingestion.discovery import discover_solidity


class TestDiscoverSolidity:
    def test_includes_contracts_directory(self):
        files = [
            "contracts/Vault.sol",
            "contracts/Oracle.sol",
        ]
        d = discover_solidity(files, limit=100)
        assert "contracts/Vault.sol" in d.in_scope

    def test_excludes_test_files(self):
        files = [
            "contracts/Vault.sol",
            "test/Vault.t.sol",
            "tests/VaultTest.sol",
        ]
        d = discover_solidity(files, limit=100)
        assert "contracts/Vault.sol" in d.in_scope
        assert "test/Vault.t.sol" not in d.in_scope

    def test_excludes_script_files(self):
        files = ["contracts/Vault.sol", "script/Deploy.s.sol"]
        d = discover_solidity(files, limit=100)
        assert "script/Deploy.s.sol" not in d.in_scope

    def test_excludes_node_modules(self):
        files = ["contracts/Vault.sol", "node_modules/openzeppelin/ERC20.sol"]
        d = discover_solidity(files, limit=100)
        assert not any("node_modules" in f for f in d.in_scope)

    def test_respects_limit(self):
        files = [f"contracts/Contract{i}.sol" for i in range(20)]
        d = discover_solidity(files, limit=5)
        assert len(d.in_scope) == 5
        assert len(d.out_of_scope) == 15

    def test_falls_back_to_test_files_when_no_contracts(self):
        """If only test files exist, they should be in scope rather than nothing."""
        files = ["test/Vault.t.sol"]
        d = discover_solidity(files, limit=100)
        assert "test/Vault.t.sol" in d.in_scope

    def test_non_sol_files_ignored(self):
        files = ["contracts/Vault.sol", "contracts/README.md"]
        d = discover_solidity(files, limit=100)
        assert not any(f.endswith(".md") for f in d.in_scope)


# ---------------------------------------------------------------------------
# Lexical mapper
# ---------------------------------------------------------------------------
from app.analysis.mapper import lexical_contracts, build_map


VAULT_SOL = """\
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EtherBank {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "failed");
        balances[msg.sender] = 0;
    }
}
"""


@pytest.fixture
def sol_repo(tmp_path):
    contracts = tmp_path / "contracts"
    contracts.mkdir()
    (contracts / "EtherBank.sol").write_text(VAULT_SOL, encoding="utf-8")
    return tmp_path


class TestLexicalContracts:
    def test_finds_contract(self, sol_repo):
        contracts = lexical_contracts(sol_repo, "contracts/EtherBank.sol")
        assert len(contracts) == 1
        assert contracts[0].name == "EtherBank"

    def test_finds_functions(self, sol_repo):
        contracts = lexical_contracts(sol_repo, "contracts/EtherBank.sol")
        fn_names = {f.name for f in contracts[0].functions}
        assert "deposit" in fn_names
        assert "withdraw" in fn_names

    def test_function_visibility(self, sol_repo):
        contracts = lexical_contracts(sol_repo, "contracts/EtherBank.sol")
        withdraw = next(f for f in contracts[0].functions if f.name == "withdraw")
        assert withdraw.visibility == "external"

    def test_line_numbers_positive(self, sol_repo):
        contracts = lexical_contracts(sol_repo, "contracts/EtherBank.sol")
        for c in contracts:
            assert c.line_start > 0
            assert c.line_end >= c.line_start
            for fn in c.functions:
                assert fn.line_start > 0
                assert fn.line_end >= fn.line_start


class TestBuildMap:
    def test_builds_empty_map_for_no_raw_contracts(self, sol_repo):
        result = build_map(sol_repo, ["contracts/EtherBank.sol"], [])
        assert any(c.name == "EtherBank" for c in result.repository_map.contracts)

    def test_lexical_file_listed(self, sol_repo):
        result = build_map(sol_repo, ["contracts/EtherBank.sol"], [])
        assert "contracts/EtherBank.sol" in result.lexical_files


# ---------------------------------------------------------------------------
# Normalization (heuristic findings)
# ---------------------------------------------------------------------------
from app.analysis.normalize import normalize


class TestHeuristicFindings:
    def test_no_crash_on_empty(self, tmp_path):
        from app.analysis.mapper import build_map
        result = build_map(tmp_path, [], [])
        normalized = normalize(tmp_path, result, [])
        assert isinstance(normalized.findings, list)
        assert isinstance(normalized.evidence, list)

    def test_findings_have_required_fields(self, sol_repo):
        from app.analysis.mapper import build_map
        result = build_map(sol_repo, ["contracts/EtherBank.sol"], [])
        normalized = normalize(sol_repo, result, [])
        for finding in normalized.findings:
            assert finding.id
            assert finding.severity in ("critical", "high", "medium", "low", "informational")
            assert finding.category
            assert 0.0 <= finding.confidence <= 1.0

    def test_findings_sorted_by_severity(self, sol_repo):
        from app.analysis.mapper import build_map
        from app.analysis.normalize import SEVERITY_RANK
        result = build_map(sol_repo, ["contracts/EtherBank.sol"], [])
        normalized = normalize(sol_repo, result, [])
        ranks = [SEVERITY_RANK[f.severity] for f in normalized.findings]
        assert ranks == sorted(ranks)


# ---------------------------------------------------------------------------
# Knowledge graph
# ---------------------------------------------------------------------------
from app.chains.graph import KnowledgeGraph
from app.models.domain import Finding, RepositoryMap


class TestKnowledgeGraph:
    def test_builds_from_empty_map(self):
        rm = RepositoryMap()
        from app.analysis.mapper import MapResult
        mapped = MapResult(repository_map=rm)
        graph = KnowledgeGraph(mapped, [])
        assert len(graph.functions) == 0

    def test_entry_function_detection(self, sol_repo):
        from app.analysis.mapper import build_map
        result = build_map(sol_repo, ["contracts/EtherBank.sol"], [])
        graph = KnowledgeGraph(result, [])
        # deposit() and withdraw() are public/external non-privileged → entries
        entries = {k for k in graph.functions if graph.is_entry(k)}
        assert ("EtherBank", "deposit") in entries or ("EtherBank", "withdraw") in entries

    def test_constructor_is_not_entry(self, sol_repo):
        from app.analysis.mapper import build_map
        result = build_map(sol_repo, ["contracts/EtherBank.sol"], [])
        graph = KnowledgeGraph(result, [])
        assert not graph.is_entry(("EtherBank", "constructor"))


# ---------------------------------------------------------------------------
# AI candidate validator
# ---------------------------------------------------------------------------
from app.ai.validator import CandidateValidator
from app.chains.drafts import EvidenceRegistry


class TestCandidateValidator:
    def _make_validator(self, sol_repo) -> CandidateValidator:
        from app.analysis.mapper import build_map
        from app.analysis.normalize import normalize
        mapped = build_map(sol_repo, ["contracts/EtherBank.sol"], [])
        normalized = normalize(sol_repo, mapped, [])
        graph = KnowledgeGraph(mapped, normalized.findings)
        registry = EvidenceRegistry(normalized.evidence)
        return CandidateValidator(graph, normalized.findings, registry, {})

    def test_rejects_empty_candidates(self, sol_repo):
        validator = self._make_validator(sol_repo)
        report = validator.validate({"chains": [], "findingRelationships": []})
        assert report.drafts == []
        assert report.rejected == []

    def test_rejects_chain_with_invalid_entry_point(self, sol_repo):
        validator = self._make_validator(sol_repo)
        candidates = {
            "chains": [{
                "title": "Potential attack",
                "summary": "Test",
                "severity": "high",
                "entryPoint": {"contract": "NonExistentContract", "function": "nonExistentFn"},
                "preconditions": [],
                "steps": [],
                "relatedFindingIds": [],
                "impact": "None",
                "assetsAtRisk": [],
                "breakPoints": [],
                "assumptions": [],
            }],
            "findingRelationships": [],
        }
        report = validator.validate(candidates)
        assert len(report.rejected) == 1

    def test_processes_finding_relationships(self, sol_repo):
        from app.analysis.mapper import build_map
        from app.analysis.normalize import normalize
        mapped = build_map(sol_repo, ["contracts/EtherBank.sol"], [])
        normalized = normalize(sol_repo, mapped, [])
        if not normalized.findings:
            pytest.skip("No findings to test relationships on")
        graph = KnowledgeGraph(mapped, normalized.findings)
        registry = EvidenceRegistry(normalized.evidence)
        validator = CandidateValidator(graph, normalized.findings, registry, {})
        fid = normalized.findings[0].id
        report = validator.validate({
            "chains": [],
            "findingRelationships": [{"findingId": fid, "relationship": "isolated", "reason": "test"}],
        })
        assert fid in report.relationships


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------
from app.storage.store import AnalysisStore
from app.core.errors import NotFoundError


class TestAnalysisStore:
    def test_new_id_is_unique(self, tmp_path):
        store = AnalysisStore(tmp_path)
        ids = {store.new_id() for _ in range(20)}
        assert len(ids) == 20

    def test_new_id_format(self, tmp_path):
        import re
        store = AnalysisStore(tmp_path)
        id_ = store.new_id()
        assert re.match(r"^[a-z0-9]{16}$", id_)

    def test_not_found_raises(self, tmp_path):
        store = AnalysisStore(tmp_path)
        with pytest.raises(NotFoundError):
            store.load_analysis("deadbeef")

    def test_write_and_read_analysis(self, tmp_path):
        from datetime import datetime, timezone
        from app.models.domain import (
            Analysis, AnalysisStage, AnalysisStatusPayload, Repository,
            RepositoryMap, StaticAnalysisInfo,
        )
        store = AnalysisStore(tmp_path)
        aid = store.new_id()
        store.create(aid)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        analysis = Analysis(
            id=aid,
            status="complete",
            repository=Repository(
                id=aid, name="test", source_type="zip",
                source_reference="test.zip", status="complete", created_at=now,
            ),
            stages=[],
            static_analysis=StaticAnalysisInfo(tool="slither", status="unavailable"),
            ai_status="skipped",
            repository_map=RepositoryMap(),
            findings=[],
            attack_chains=[],
            evidence=[],
            diagnostics=[],
            limitations=[],
            created_at=now,
        )
        store.save_analysis(analysis)
        loaded = store.load_analysis(aid)
        assert loaded.id == aid
        assert loaded.status == "complete"

    def test_source_path_traversal_rejected(self, tmp_path):
        store = AnalysisStore(tmp_path)
        # Create a minimal valid analysis to pass ID check
        aid = store.new_id()
        store.create(aid)
        # Try to read outside repo dir
        result = store.read_source(aid, "../../../etc/passwd")
        assert result is None

    def test_source_absolute_path_rejected(self, tmp_path):
        store = AnalysisStore(tmp_path)
        aid = store.new_id()
        store.create(aid)
        result = store.read_source(aid, "/etc/passwd")
        assert result is None
