GitHub Pages 배포 방법
=======================

이 폴더(`vision-survivor/`)를 Pages로 자동 배포하도록 리포지토리에 GitHub Actions 워크플로가 추가되어 있습니다.

1) 리포지토리 푸시
-------------------

- 아직 Git 초기화 전이라면:

  ```bash
  git init
  git add .
  git commit -m "Add Vision Survivor v1 + Pages workflow"
  # GitHub에 새 리포 만들고 origin 연결 (기존 리포가 있다면 이 단계 생략)
  # 방법 A) GitHub 웹에서 리포 생성 후 안내에 따라 origin 추가
  git remote add origin https://github.com/<USER>/<REPO>.git
  # 방법 B) GitHub CLI 사용 시: gh repo create <REPO> --public --source . --remote origin --push
  git push -u origin main
  ```

- 이미 리포가 있고 원격이 연결되어 있다면 변경사항만 푸시:

  ```bash
  git add .
  git commit -m "Deploy Vision Survivor via GitHub Pages"
  git push
  ```

2) Pages 설정 확인
-------------------

- 리포지토리 → Settings → Pages에서 Build and deployment가 "GitHub Actions"로 되어 있는지 확인합니다.
- 워크플로(`.github/workflows/pages.yml`)는 `vision-survivor/` 폴더를 Pages 사이트의 루트로 배포합니다.

3) URL 접속
------------

- 푸시가 완료되면 Actions가 실행되고, 완료 후 Pages 주소가 표시됩니다.
- 기본 주소 형식: `https://<USER>.github.io/<REPO>/`
- 이 리포를 전용 사이트로 쓰고 싶다면, 별도 리포(`<USER>.github.io`)에 동일 폴더 구조로 푸시하면 루트 `https://<USER>.github.io/`에서 열립니다.

문제 해결
---------

- Actions 실패 시 로그에서 `upload-pages-artifact` 경로나 파일 누락을 확인하세요. 이 프로젝트는 `vision-survivor/` 안에 `index.html`이 있어야 합니다.
- Jekyll 무시를 위해 `.nojekyll` 파일을 포함했습니다.

