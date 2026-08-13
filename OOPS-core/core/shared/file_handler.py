from core.libraries import *
from core.constants import *

import signal  # not re-exported by core.libraries


_GIT_BASH = r'C:\Program Files\Git\usr\bin\bash.exe'


def _resolve_bash() -> str:

    # on Windows, plain 'bash' can resolve to the System32 WSL launcher stub instead of Git Bash,
    # which hangs indefinitely (rather than erroring) when WSL isn't set up — pin to Git Bash explicitly

    return _GIT_BASH if os.name == 'nt' and os.path.isfile(_GIT_BASH) else 'bash'


def _kill_tree(pid: int) -> None:

    # killing only the shell leaves its children (grep/find/...) alive holding the stdout pipe open,
    # which makes the subsequent read block long past the timeout — take out the whole tree

    if os.name == 'nt':

        subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)], capture_output=True, check=False)

    else:

        os.killpg(os.getpgid(pid), signal.SIGKILL)


def _resolve_env() -> dict[str, str]:

    env = {**os.environ, 'LANG': 'en_US.UTF-8'}

    # Git Bash spawned from a Windows parent (e.g. PowerShell) inherits the Windows PATH, which has no
    # entry for Git's coreutils — without this every ls/cat/grep dies with 'command not found' and the
    # agent silently hallucinates its answer from empty tool output

    if os.name == 'nt' and os.path.isfile(_GIT_BASH):

        env['PATH'] = os.path.dirname(_GIT_BASH) + os.pathsep + env.get('PATH', '')

    return env


class FileHandler(Toolkit):

    __project_directory: str | None

    __ignore_sufx: list[str]

    __ignore_path: list[str]

    __file_buff: dict[str, str]

    def __init__(
        self: Self,
        directory: str,  # parameter required
        ignore_sufx: list[str] | None = None,
        ignore_path: list[str] | None = None,
        enable_concat_file: bool = False,
        enable_search_text: bool = False,
        enable_search_path: bool = False,
        enable_run_command: bool = True,
        **kwargs: dict[str, Any]
    ):  # with llm tools

        self.__file_buff, self.__project_directory = {}, directory
        self.__ignore_sufx = ignore_sufx or []
        self.__ignore_path = ignore_path or []
        ignore = [i for i in FILE_IGNORE_PATTERNS]

        ignore.extend([f'\\^{re.escape(i)}/'[1:] for i in self.__ignore_path])
        ignore.extend([f'\\/{re.escape(i)}/'[1:] for i in self.__ignore_path])
        ignore.extend([f'\\.{re.escape(i)}$'[0:] for i in self.__ignore_sufx])

        for basepath, dirnames, filelist in pathlib.Path(self.__project_directory).walk():

            assert basepath is not None
            assert filelist is not None

            # prune ignored directories before descending, so large trees like node_modules/.git are never walked

            dirnames[:] = [i for i in dirnames if not any(
                re.search(j, ((basepath / i).relative_to(self.__project_directory).as_posix() + '/').upper()) or
                re.search(j, ((basepath / i).relative_to(self.__project_directory).as_posix() + '/').lower())
                for j in ignore
            )]

            for file in filter(lambda x: FILE_MIN_SIZE < x.stat().st_size < FILE_MAX_SIZE, map(basepath.joinpath, filelist)):

                ufile = file.relative_to(self.__project_directory).as_posix().upper()
                lfile = file.relative_to(self.__project_directory).as_posix().lower()

                if any(re.search(i, ufile) for i in ignore):
                    continue

                if any(re.search(i, lfile) for i in ignore):
                    continue

                try:  # cache file content
                    with open(file, 'r', encoding='utf-8') as __file:
                        posix = file.relative_to(self.__project_directory).as_posix()
                        posix = file.relative_to(self.__project_directory).as_posix()
                        self.__file_buff[posix] = __file.read().strip()
                except UnicodeDecodeError:
                    pass  # ignore all binary files
                    pass  # ignore all binary files

        super().__init__(name='tools', tools=[i for i in (
            self.concat_file if enable_concat_file else None,
            self.search_text if enable_search_text else None,
            self.search_path if enable_search_path else None,
            self.run_command if enable_run_command else None
        ) if i], **kwargs)

    def concat_file(self: Self, file: str) -> dict[str, str]:
        '''
        Output contents of the given file in project directory.

        Args:
            file (str): The name of the file to concatenate.

        Returns:
            dict[str, str]: A dictionary containing:
                - 'content': The contents of the file if it exists, or an empty string if it does not.
                - 'exist': A string indicating whether the file exists ('True' or 'False').
        '''
        return {'content': self.__file_buff.get(file, ''), 'exist': str(file in self.__file_buff)}

    def search_text(self: Self, regex: str) -> list[str]:
        '''
        Search files whose text matches the regex pattern in project directory.

        Args:
            regex (str): The regex pattern to search for.

        Returns:
            list[str]: A list of file paths that match the pattern.
        '''
        return [i[0] for i in self.__file_buff.items() if re.search(regex, i[1])]

    def search_path(self: Self, regex: str) -> list[str]:
        '''
        Search files whose path matches the regex pattern in project directory.

        Args:
            regex (str): The regex pattern to search for.

        Returns:
            list[str]: A list of file paths that match the pattern.
        '''
        return [i[0] for i in self.__file_buff.items() if re.search(regex, i[0])]

    def __denied_token(self: Self, command: str) -> str | None:

        # run_command executes arbitrary shell inside the project, so anything the caller kept out of the
        # file cache (typically .env, holding db credentials and signing secrets) has to be unreachable here
        # too — otherwise a single `cat .env` ships those secrets to the model provider

        for sufx in self.__ignore_sufx:

            # matches `.env`, `.env.local`, `.env.production` — but not `.environment`

            pattern = rf'\.{re.escape(sufx)}(?:\.[\w-]+)*(?:$|[\s\'"/;|&])'

            if re.search(pattern, command, re.IGNORECASE):

                return f'*.{sufx}'

        return None

    def run_command(self: Self, command: str) -> dict[str, str]:
        '''
        Run a Unix command and get outputs in the project directory. You must not run any source code of the project.

        Args:
            command (str): The Unix command to run.

        Returns:
            dict[str, str]: A dictionary containing:
                - 'stdout': The standard output of the command.
                - 'stderr': The standard error of the command.
        '''
        if (denied := self.__denied_token(command)) is not None:

            return {'stdout': '', 'stderr': f'refused: this project excludes {denied} from analysis. rerun without referencing it.'}

        process = subprocess.Popen([_resolve_bash(), '-c', command], cwd=self.__project_directory,
            stdout=subprocess.PIPE,  # collect output from stdout
            stderr=subprocess.PIPE,  # collect output from stderr
            stdin=subprocess.DEVNULL,  # never let a command block waiting on input that will never arrive
            start_new_session=(os.name != 'nt'),  # gives POSIX a process group for _kill_tree to signal
            shell=False, encoding='utf-8', errors='replace', env=_resolve_env())

        try:

            stdout, stderr = process.communicate(timeout=LLM_TOOL_CALL_MAX_TIMEOUT)

        except subprocess.TimeoutExpired:

            _kill_tree(process.pid)

            try:  # the tree is dead, so this drains what was already buffered rather than blocking

                stdout, stderr = process.communicate(timeout=5)

            except subprocess.TimeoutExpired:

                stdout, stderr = '', ''

            # report back to the llm instead of raising, so it can retry with a narrower command

            stderr = (stderr or '') + (
                f'\ncommand timed out after {LLM_TOOL_CALL_MAX_TIMEOUT}s and was killed. '
                'narrow the search: pass an explicit path (e.g. src/) and exclude vendor directories '
                '(--exclude-dir=node_modules), since a bare recursive search scans the whole project.'
            )

        return {'stdout': stdout or '', 'stderr': stderr or ''}

    def get_ignore_sufx(self: Self) -> list[str]:

        return self.__ignore_sufx  # static filter

    def get_ignore_path(self: Self) -> list[str]:

        return self.__ignore_path  # static filter

    def get_files(self: Self) -> dict[str, str]:

        return self.__file_buff  # cached files
