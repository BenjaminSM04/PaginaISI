import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './users.dto';
import { AllowUnverified, CurrentUser, Public, AuthUser } from '../common/decorators';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me/activity')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mi actividad: proyectos, artículos, preguntas y transacciones de puntos' })
  myActivity(@CurrentUser() user: AuthUser) {
    return this.users.myActivity(user.id);
  }

  @Patch('me/profile')
  @AllowUnverified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualiza mi perfil y habilidades' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Public()
  @Get('directory/teachers')
  @ApiOperation({ summary: 'Docentes disponibles como revisores' })
  teachers() {
    return this.users.teachers();
  }

  @Public()
  @Get(':username')
  @ApiOperation({ summary: 'Perfil público por username' })
  publicProfile(@Param('username') username: string) {
    return this.users.publicProfile(username);
  }
}
