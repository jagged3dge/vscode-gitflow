'use strict';

import * as vscode from 'vscode';
import { findGit, git } from './git';
import { flow } from './flow';
import { fail } from './fail';
import { GitExtension, Repository } from './git-extension';
import { basename } from 'path';

class RepositoryQuickPickItem implements vscode.QuickPickItem {
  constructor(repo: Repository) {
    this.repository = repo;
    this.label = basename(repo.rootUri.fsPath);
    this.description = repo.rootUri.fsPath;
  }

  repository: Repository;
  label: string;
  description?: string | undefined;
  detail?: string | undefined;
  picked: boolean = false;
  alwaysShow: boolean = false;
}

async function selectRepo() {
  //
  // Handle multi-workspace
  //
  const folders = vscode.workspace.workspaceFolders || [];

  if (folders.length > 1) {
    const repo = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select one repository',
    });

    if (!repo) {
      fail.error({
        message: 'You have to select one repository',
      });
    }

    flow.workingDir = repo?.uri.path;
    flow.workingRepo = repo?.name;
  }

  //
  // Handle git submodules
  //
  const gitExtension = vscode.extensions.getExtension<GitExtension>(
    'vscode.git'
  )?.exports;

  const api = gitExtension?.getAPI(1);
  let currentRepo: Repository | undefined = undefined;

  if (!api?.repositories) return;
  if ((api?.repositories ?? []).length < 2) return;

  // Show picker for repositories
  const repos = api?.repositories.map((repo) => {
    // return basename(repo.rootUri.fsPath);
    return new RepositoryQuickPickItem(repo);
  });

  const repo = await vscode.window.showQuickPick(repos, {
    placeHolder: 'Choose a repository',
  });

  if (!repo) return;

  if (!!repo) {
    currentRepo = api?.repositories.find((r) => {
      return r.rootUri.fsPath == repo.repository.rootUri.fsPath;
    });
  }

  if (!!currentRepo) {
    flow.workingDir = currentRepo.rootUri.path;
    flow.workingRepo = basename(currentRepo.rootUri.path);
  }
}

async function runWrapped<T>(
  fn: (...any) => Thenable<T>,
  args: any[] = []
): Promise<T | null> {
  try {
    return await fn(...args);
  } catch (e) {
    if (!e.handlers && !e.message) {
      throw e;
    }

    const err: fail.IError = e;
    const chosen = await vscode.window.showErrorMessage(
      err.message,
      ...(err.handlers || [])
    );
    if (!!chosen) {
      return await runWrapped(chosen.cb);
    }
    return null;
  }
}

async function setup(disposables: vscode.Disposable[]) {
  const pathHint = vscode.workspace.getConfiguration('git').get<string>('path');
  git.info = await findGit(pathHint);
  vscode.window.setStatusBarMessage(
    'gitflow using git executable: ' +
      git.info.path +
      ' with version ' +
      git.info.version,
    5000
  );
  const commands = [
    vscode.commands.registerCommand('gitflow.initialize', async () => {
      await selectRepo();
      // await runWrapped(flow.initialize)
    }),
    vscode.commands.registerCommand('gitflow.featureStart', async () => {
      await selectRepo();
      await runWrapped(flow.requireFlowEnabled);
      await runWrapped(flow.feature.precheck);
      const name = await vscode.window.showInputBox({
        placeHolder: 'my-awesome-feature',
        prompt: 'A new name for your feature',
      });
      if (!name) {
        return;
      }
      await runWrapped(flow.feature.start, [
        name.split(' ').join('-'),
        'feature',
      ]);
    }),
    vscode.commands.registerCommand('gitflow.featureRebase', async () => {
      await selectRepo();
      await runWrapped(flow.feature.rebase, ['feature']);
    }),
    vscode.commands.registerCommand('gitflow.featureFinish', async () => {
      await selectRepo();
      await runWrapped(flow.feature.finish, ['feature']);
    }),
    vscode.commands.registerCommand('gitflow.bugfixStart', async () => {
      await selectRepo();
      await runWrapped(flow.requireFlowEnabled);
      await runWrapped(flow.feature.precheck);
      const name = await vscode.window.showInputBox({
        placeHolder: 'my-awesome-bugfix',
        prompt: 'A new name for your bugfix',
      });
      if (!name) {
        return;
      }
      await runWrapped(flow.feature.start, [
        name.split(' ').join('-'),
        'bugfix',
      ]);
    }),
    vscode.commands.registerCommand('gitflow.bugfixRebase', async () => {
      await selectRepo();
      await runWrapped(flow.feature.rebase, ['bugfix']);
    }),
    vscode.commands.registerCommand('gitflow.bugfixFinish', async () => {
      await selectRepo();
      await runWrapped(flow.feature.finish, ['bugfix']);
    }),
    vscode.commands.registerCommand('gitflow.releaseStart', async () => {
      await selectRepo();
      await runWrapped(flow.requireFlowEnabled);
      await runWrapped(flow.release.precheck);
      const guessedVersion =
        (await runWrapped(flow.release.guess_new_version)) || '';
      const name = await vscode.window.showInputBox({
        placeHolder: guessedVersion,
        prompt: 'The name of the release',
        value: guessedVersion,
      });
      if (!name) {
        return;
      }
      await runWrapped(flow.release.start, [name.split(' ').join('-')]);
    }),
    vscode.commands.registerCommand('gitflow.releaseFinish', async () => {
      await selectRepo();
      await runWrapped(flow.release.finish);
    }),
    vscode.commands.registerCommand('gitflow.hotfixStart', async () => {
      await selectRepo();
      await runWrapped(flow.requireFlowEnabled);
      const guessedVersion =
        (await runWrapped(flow.hotfix.guess_new_version)) || '';
      const name = await vscode.window.showInputBox({
        placeHolder: guessedVersion,
        prompt: 'The name of the hotfix version',
        value: guessedVersion,
      });
      if (!name) {
        return;
      }
      await runWrapped(flow.hotfix.start, [name.split(' ').join('-')]);
    }),
    vscode.commands.registerCommand('gitflow.hotfixFinish', async () => {
      await selectRepo();
      await runWrapped(flow.hotfix.finish);
    }),
  ];
  // add disposable
  disposables.push(...commands);
}

export function activate(context: vscode.ExtensionContext) {
  const disposables: vscode.Disposable[] = [];
  context.subscriptions.push(
    new vscode.Disposable(() =>
      vscode.Disposable.from(...disposables).dispose()
    )
  );

  setup(disposables).catch((err) => console.error(err));
}

export function deactivate() {}
